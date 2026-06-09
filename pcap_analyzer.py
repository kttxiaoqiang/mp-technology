#!/usr/bin/env python3
"""
Wireshark 抓包分析工具 - TLS 证书 + 密码套件提取
用法: python3 pcap_analyzer.py [端口号]
默认端口: 3346
"""

import os
import sys
import json
import struct
import tempfile
import traceback
from base64 import b64encode

try:
    from bottle import Bottle, request, response, static_file, template, HTTPResponse
except ImportError:
    print("需要安装 bottle: pip3 install bottle")
    sys.exit(1)

try:
    import dpkt
    from dpkt.ssl import TLSRecord, TLSHandshake, TLSCertificate, TLSServerHello
    from dpkt.ssl import TLSChangeCipherSpec, TLSClientHello, TLSAlert, TLSAppData
    from dpkt import ssl_ciphersuites
except ImportError:
    print("需要安装 dpkt: pip3 install dpkt")
    sys.exit(1)

try:
    from cryptography import x509
    from cryptography.hazmat.backends import default_backend
    from cryptography.hazmat.primitives import hashes, serialization
    HAVE_CRYPTO = True
except ImportError:
    HAVE_CRYPTO = False

# ============================================================
# 密码套件分类 (国密 vs 国际)
# ============================================================
def classify_cipher_suite(name):
    """根据密码套件名称分类"""
    name = name.upper()
    if 'ECC_SM4' in name or 'SM2' in name or 'SM3' in name or 'SM4' in name:
        return '国密'
    if 'NULL' in name:
        return '空加密(不安全)'
    if 'EXPORT' in name or 'anon' in name.upper() or 'ANON' in name:
        return '弱密码(不安全)'
    return '国际算法'

# 国密/TLCP 密码套件映射 (dpkt 不包含)
GM_CIPHER_SUITES = {
    0xE011: 'TLS_ECC_SM4_CBC_SM3',       # SM2+SM4-CBC+SM3
    0xE012: 'TLS_ECC_SM4_CBC_SM3_HMAC',   # SM2+SM4-CBC+SM3-HMAC
    0xE013: 'TLS_ECC_SM4_SM3',            # SM2+SM4+SM3 (GM/T 0024)
    0xE016: 'TLS_ECDHE_SM4_CBC_SM3',      # ECDHE+SM4-CBC+SM3
    0xE017: 'TLS_ECDHE_SM4_GCM_SM3',      # ECDHE+SM4-GCM+SM3
    0xE01A: 'TLS_ECC_SM4_GCM_SM3_PSK',    # PSK+SM2+SM4-GCM+SM3
    0xE01B: 'TLS_ECDHE_SM4_GCM_SM3_PSK',  # PSK+ECDHE+SM4-GCM+SM3
    0xE041: 'TLS_SM4_GCM_SM3',            # SM4-GCM+SM3 (IETF)
    0xE042: 'TLS_SM4_CCM_SM3',            # SM4-CCM+SM3 (IETF)
    0xE043: 'TLS_SM4_GCM_SM3_PSK',        # PSK+SM4-GCM+SM3
    0xE044: 'TLS_SM4_CCM_SM3_PSK',        # PSK+SM4-CCM+SM3
    0x0301: 'TLS_ECDHE_SM4_CBC_SM3',      # 国密 SSL VPN (0x0301 复用)
}

# GM/T 0024 扩展 master secret 标识
GM_MASTER_SECRET_TYPES = {
    0x00: '标准 TLS',
    0x01: '国密双证书',
    0x02: '国密单证书',
}

def get_cipher_suite_name(code):
    """获取密码套件名称（含国密扩展）"""
    # 先查国密映射
    if code in GM_CIPHER_SUITES:
        return GM_CIPHER_SUITES[code]
    try:
        if code in ssl_ciphersuites.BY_CODE:
            return ssl_ciphersuites.BY_CODE[code].name
    except:
        pass
    return f"未知套件 (0x{code:04X})"

# ============================================================
# TLS 流重组 + 解析
# ============================================================
class TLSStreamReassembler:
    """TCP 流重组器，按源/目的 IP+端口分组"""

    def __init__(self):
        self.streams = {}  # key: (src_ip, src_port, dst_ip, dst_port)

    def _stream_key(self, ip1, port1, ip2, port2):
        """服务端 IP 小的放前面做统一 key"""
        if ip1 < ip2 or (ip1 == ip2 and port1 < port2):
            return (ip1, port1, ip2, port2)
        return (ip2, port2, ip1, port1)

    def add_packet(self, ts, src_ip, src_port, dst_ip, dst_port, data):
        key = self._stream_key(src_ip, src_port, dst_ip, dst_port)
        if key not in self.streams:
            self.streams[key] = {
                'key': key,
                'packets': [],
                'client_data': b'',  # 客户端 -> 服务端
                'server_data': b'',  # 服务端 -> 客户端
            }
        s = self.streams[key]
        s['packets'].append((ts, src_ip, src_port, dst_ip, dst_port, len(data)))
        if src_ip == key[0] and src_port == key[1]:
            s['client_data'] += data
        else:
            s['server_data'] += data


class TLSParser:
    """TLS 记录解析器"""

    def __init__(self):
        self.certificates = []  # 所有发现的证书
        self.cipher_suites = []  # 所有发现的密码套件 (negotiated)

    def parse_stream(self, client_data, server_data, server_ip):
        """解析一个 TCP 流的双向数据，提取该服务器的 TLS 信息"""
        results = {
            'server_ip': server_ip,
            'server_hello': None,
            'client_hello': None,
            'certificates': [],
            'cipher_suite': None,
        }

        # 解析服务端数据
        self._parse_tls_records(server_data, 'server', results)
        # 解析客户端数据
        self._parse_tls_records(client_data, 'client', results)

        # 构建证书链（按 Issuer→Subject 关系排序）
        results['cert_chain'] = self.build_cert_chain(results['certificates'])

        return results

    def build_cert_chain(self, certs):
        """
        将证书列表按 Issuer→Subject 关系组装成证书链。
        返回: [
          {
            'chain': [
              {'is_server_cert': True, 'cert': {...}},
              {'is_server_cert': False, 'cert': {...}},
              ...
            ]
          },
          ...  # 第二条链
        ]
        """
        if not certs:
            return []

        # 构建 Subject → cert 字典
        subject_map = {}
        for c in certs:
            subj = c.get('subject', '')
            subject_map[subj] = c

        # 判断是否自签名
        def is_self_signed(c):
            return c.get('subject') == c.get('issuer')

        # 从叶子开始追踪完整链
        def follow_chain(leaf):
            chain = [leaf]
            current = leaf
            visited = {id(current)}
            while True:
                issuer = current.get('issuer', '')
                if not issuer or issuer == current.get('subject', ''):
                    break  # 根或自签名
                if issuer in subject_map:
                    next_cert = subject_map[issuer]
                    if id(next_cert) in visited:
                        break  # 环路保护
                    visited.add(id(next_cert))
                    chain.append(next_cert)
                    current = next_cert
                else:
                    break  # 找不到颁发者，链断
            return chain

        # 找出所有可能的叶子（非颁发者，或颁发者不在列表中）
        issuers = set()
        for c in certs:
            iss = c.get('issuer', '')
            if iss:
                issuers.add(iss)

        leaves = []
        for c in certs:
            subj = c.get('subject', '')
            # 叶子：不颁发给任何人，或是自签名且可能独立
            if subj not in issuers or is_self_signed(c):
                leaves.append(c)

        # 从每个叶子追链
        built_chains = []
        used = set()
        for leaf in leaves:
            if id(leaf) in used:
                continue
            chain_certs = follow_chain(leaf)
            chain_entries = []
            for i, c in enumerate(chain_certs):
                if id(c) not in used:
                    used.add(id(c))
                    chain_entries.append({
                        'is_server_cert': i == 0,
                        'cert': c,
                    })
            if chain_entries:
                built_chains.append({'chain': chain_entries})

        # 如果还有未使用的证书（孤儿），每条单独成链
        orphans = [c for c in certs if id(c) not in used]
        for o in orphans:
            built_chains.append({
                'chain': [{'is_server_cert': True, 'cert': o}]
            })

        return built_chains

    def _parse_tls_records(self, data, role, results):
        """解析 TLS 记录序列"""
        offset = 0
        while offset + 5 < len(data):
            try:
                # TLS Record Header: ContentType(1) + Version(2) + Length(2)
                content_type = data[offset]
                version = struct.unpack('!H', data[offset+1:offset+3])[0]
                length = struct.unpack('!H', data[offset+3:offset+5])[0]

                if offset + 5 + length > len(data):
                    break

                payload = data[offset+5:offset+5+length]
                offset += 5 + length

                # ContentType 22 = Handshake
                if content_type == 22:
                    self._parse_handshake(payload, role, results)
                # ContentType 20 = ChangeCipherSpec
                elif content_type == 20:
                    pass  # 不需要解析

            except (struct.error, IndexError):
                break

    def _parse_handshake(self, data, role, results):
        """解析 Handshake 消息"""
        hs_offset = 0
        while hs_offset + 4 < len(data):
            try:
                hs_type = data[hs_offset]
                hs_len = struct.unpack('!I', b'\x00' + data[hs_offset+1:hs_offset+4])[0]
                if hs_offset + 4 + hs_len > len(data):
                    break

                hs_body = data[hs_offset+4:hs_offset+4+hs_len]

                # Handshake Type 2 = ServerHello
                if hs_type == 2 and role == 'server' and results['server_hello'] is None:
                    self._parse_server_hello(hs_body, results)

                # Handshake Type 11 = Certificate
                elif hs_type == 11:
                    self._parse_certificates(hs_body, results)

                # Handshake Type 1 = ClientHello
                elif hs_type == 1 and role == 'client' and results['client_hello'] is None:
                    self._parse_client_hello(hs_body, results)

                hs_offset += 4 + hs_len

            except (struct.error, IndexError):
                break

    def _parse_server_hello(self, data, results):
        """解析 ServerHello 获取 TLS 版本、Random、Session ID、密码套件、压缩、Extensions"""
        try:
            if len(data) < 35:
                return

            # version(2)
            server_version = struct.unpack('!H', data[0:2])[0]
            ver_major = (server_version >> 8) & 0xff
            ver_minor = server_version & 0xff
            if server_version == 0x0304:
                ver_name = 'TLS 1.3'
            elif server_version == 0x0303:
                ver_name = 'TLS 1.2'
            elif server_version == 0x0302:
                ver_name = 'TLS 1.1'
            elif server_version == 0x0301:
                ver_name = 'TLS 1.0'
            elif server_version == 0x0300:
                ver_name = 'SSL 3.0'
            else:
                ver_name = f'{ver_major}.{ver_minor}'

            # random(32)
            random_bytes = data[2:34]
            random_hex = random_bytes.hex()
            random_b64 = b64encode(random_bytes).decode()

            # session_id_len(1) + session_id
            sid_len = data[34]
            session_id = ''
            if sid_len > 0 and 35 + sid_len <= len(data):
                session_id = data[35:35+sid_len].hex()
            pos = 35 + sid_len
            if pos + 2 > len(data):
                return

            cipher_code = struct.unpack('!H', data[pos:pos+2])[0]
            name = get_cipher_suite_name(cipher_code)

            pos += 2

            # compression_method(1)
            compression = '未知'
            if pos < len(data):
                cm = data[pos]
                if cm == 0:
                    compression = 'null (不压缩)'
                elif cm == 1:
                    compression = 'DEFLATE'
                else:
                    compression = f'0x{cm:02X}'
            pos += 1

            # extensions
            extensions = []
            if pos + 2 <= len(data):
                ext_total_len = struct.unpack('!H', data[pos:pos+2])[0]
                pos += 2
                ext_end = pos + ext_total_len
                while pos + 4 <= ext_end and pos + 4 <= len(data):
                    ext_type = struct.unpack('!H', data[pos:pos+2])[0]
                    ext_len = struct.unpack('!H', data[pos+2:pos+4])[0]
                    pos += 4
                    ext_data = data[pos:pos+ext_len] if pos + ext_len <= len(data) else b''
                    pos += ext_len

                    ext_names = {
                        0x0000: 'server_name (SNI)',
                        0x0005: 'status_request (OCSP)',
                        0x000b: 'ec_point_formats',
                        0x000d: 'signature_algorithms',
                        0x0010: 'application_layer_protocol_negotiation (ALPN)',
                        0x0012: 'signed_certificate_timestamp',
                        0x0013: 'certificate_authorities',
                        0x0015: 'certificate_compression',
                        0x0016: 'encrypt_then_mac',
                        0x0017: 'extended_master_secret',
                        0x0023: 'session_ticket',
                        0x0029: 'pre_shared_key',
                        0x002b: 'supported_versions',
                        0x002d: 'psk_key_exchange_modes',
                        0x0033: 'key_share',
                        0x3371: 'token_binding',
                        0xff01: 'renegotiation_info',
                    }
                    ename = ext_names.get(ext_type, f'未知 (0x{ext_type:04X})')
                    edesc = ext_data.hex() if ext_data else '(空)'
                    if edesc != '(空)' and len(edesc) > 64:
                        edesc = edesc[:64] + '...'
                    extensions.append({
                        'type': f'0x{ext_type:04X}',
                        'name': ename,
                        'length': ext_len,
                        'data': edesc,
                    })

            info = {
                'version_code': f'0x{server_version:04X}',
                'version_name': ver_name,
                'random_hex': random_hex[:32] + '...' if len(random_hex) > 32 else random_hex,
                'random_full': random_hex,
                'random_b64': random_b64,
                'session_id': session_id[:32] + '...' if len(session_id) > 32 else session_id,
                'session_id_full': session_id,
                'cipher_suite_code': f"0x{cipher_code:04X}",
                'cipher_suite_name': name,
                'cipher_suite_type': classify_cipher_suite(name),
                'compression': compression,
                'extensions': extensions,
            }
            results['server_hello'] = info
            results['cipher_suite'] = {
                'cipher_suite_code': f"0x{cipher_code:04X}",
                'cipher_suite_name': name,
                'cipher_suite_type': classify_cipher_suite(name),
            }
        except Exception:
            pass

    def _parse_client_hello(self, data, results):
        """解析 ClientHello 获取支持的密码套件列表"""
        try:
            if len(data) < 39:
                return
            # version(2) + random(32) + session_id_len(1)
            sid_len = data[38]
            pos = 39 + sid_len
            if pos + 2 > len(data):
                return

            # cipher suites length
            cs_len = struct.unpack('!H', data[pos:pos+2])[0]
            pos += 2

            suites = []
            end = pos + cs_len
            while pos + 1 < end and pos < len(data):
                if pos + 2 > len(data):
                    break
                code = struct.unpack('!H', data[pos:pos+2])[0]
                name = get_cipher_suite_name(code)
                suites.append({
                    'code': f"0x{code:04X}",
                    'name': name,
                    'type': classify_cipher_suite(name),
                })
                pos += 2

            results['client_hello'] = suites
        except Exception:
            pass

    def _parse_certificates(self, data, results):
        """解析 Certificate 消息提取证书"""
        try:
            # certificate_list_length(3)
            if len(data) < 3:
                return
            total_len = struct.unpack('!I', b'\x00' + data[:3])[0]
            pos = 3
            while pos + 3 <= len(data) and pos < 3 + total_len:
                cert_len = struct.unpack('!I', b'\x00' + data[pos:pos+3])[0]
                pos += 3
                if pos + cert_len > len(data):
                    break
                cert_der = data[pos:pos+cert_len]

                cert_info = self._parse_cert_der(cert_der)
                if cert_info:
                    results['certificates'].append(cert_info)

                pos += cert_len
        except Exception:
            pass

    def _parse_cert_der(self, der_data):
        """解析 DER 编码的 X.509 证书"""
        result = {'der': b64encode(der_data).decode()}

        if HAVE_CRYPTO:
            try:
                cert = x509.load_der_x509_certificate(der_data, default_backend())

                # 基本信息
                subject = cert.subject
                issuer = cert.issuer

                result['subject'] = self._format_dn(subject)
                result['issuer'] = self._format_dn(issuer)
                result['serial'] = str(cert.serial_number)
                result['version'] = cert.version.value
                result['not_before'] = cert.not_valid_before_utc.isoformat() if hasattr(cert, 'not_valid_before_utc') else str(cert.not_valid_before)
                result['not_after'] = cert.not_valid_after_utc.isoformat() if hasattr(cert, 'not_valid_after_utc') else str(cert.not_valid_after)
                result['signature_algorithm'] = cert.signature_algorithm_oid._name if hasattr(cert.signature_algorithm_oid, '_name') else str(cert.signature_algorithm_oid)
                result['is_self_signed'] = subject == issuer

                # 公钥信息
                pub_key = cert.public_key()
                from cryptography.hazmat.primitives.asymmetric import rsa, ec, dsa, ed25519, ed448
                if isinstance(pub_key, rsa.RSAPublicKey):
                    result['public_key'] = f'RSA {pub_key.key_size} bits'
                elif isinstance(pub_key, ec.EllipticCurvePublicKey):
                    curve_name = pub_key.curve.name if hasattr(pub_key.curve, 'name') else str(pub_key.curve)
                    result['public_key'] = f'ECC {curve_name}'
                elif isinstance(pub_key, dsa.DSAPublicKey):
                    result['public_key'] = f'DSA {pub_key.key_size} bits'
                elif isinstance(pub_key, ed25519.Ed25519PublicKey):
                    result['public_key'] = 'Ed25519'
                elif isinstance(pub_key, ed448.Ed448PublicKey):
                    result['public_key'] = 'Ed448'
                else:
                    result['public_key'] = type(pub_key).__name__

                # SAN
                try:
                    san_ext = cert.extensions.get_extension_for_class(x509.SubjectAlternativeName)
                    result['san'] = [str(name) for name in san_ext.value]
                except x509.ExtensionNotFound:
                    result['san'] = []

                # 密钥用法
                try:
                    ku_ext = cert.extensions.get_extension_for_class(x509.KeyUsage)
                    ku = ku_ext.value
                    result['key_usage'] = []
                    has_ka = ku.key_agreement
                    for attr in ['digital_signature', 'key_encipherment', 'key_agreement',
                                 'key_cert_sign', 'crl_sign', 'data_encipherment',
                                 'encipher_only', 'decipher_only', 'content_commitment']:
                        if not has_ka and attr in ('encipher_only', 'decipher_only'):
                            continue
                        try:
                            val = getattr(ku, attr)
                            if val:
                                result['key_usage'].append(attr)
                        except ValueError:
                            pass
                except x509.ExtensionNotFound:
                    result['key_usage'] = []

                # 扩展密钥用法
                try:
                    eku_ext = cert.extensions.get_extension_for_class(x509.ExtendedKeyUsage)
                    result['ext_key_usage'] = [str(oid._name) if hasattr(oid, '_name') else str(oid)
                                                for oid in eku_ext.value]
                except x509.ExtensionNotFound:
                    result['ext_key_usage'] = []

            except Exception as e:
                err_str = str(e)
                if 'SM2' in err_str or 'sm2' in err_str.lower() or 'elliptic curve' in err_str.lower():
                    # SM2 国密证书，用纯 Python 解析
                    try:
                        sm2_result = self._parse_sm2_cert_der(der_data)
                        result.update(sm2_result)
                        result['cipher_type'] = '国密'  # 成功解析为国密证书
                        result.pop('parse_error', None)  # 清除旧 parse_error
                    except Exception as sm2_e:
                        result['subject'] = '(解析失败)'
                        result['issuer'] = '(解析失败)'
                        result['serial'] = '(解析失败)'
                        result['version'] = 0
                        result['not_before'] = ''
                        result['not_after'] = ''
                        result['signature_algorithm'] = ''
                        result['is_self_signed'] = False
                        result['public_key'] = '(解析失败)'
                        result['san'] = []
                        result['key_usage'] = []
                        result['ext_key_usage'] = []
                        result['parse_error'] = 'SM2: ' + str(sm2_e)
                else:
                    # 其他解析失败，回退到基本信息
                    result['subject'] = '(解析失败)'
                    result['issuer'] = '(解析失败)'
                    result['serial'] = '(解析失败)'
                    result['version'] = 0
                    result['not_before'] = ''
                    result['not_after'] = ''
                    result['signature_algorithm'] = ''
                    result['is_self_signed'] = False
                    result['public_key'] = '(解析失败)'
                    result['san'] = []
                    result['key_usage'] = []
                    result['ext_key_usage'] = []
                    result['parse_error'] = err_str
        else:
            result['subject'] = '(需安装 cryptography 库以解析证书详情)'
            result['issuer'] = ''
            result['serial'] = ''
            result['version'] = 0
            result['not_before'] = ''
            result['not_after'] = ''
            result['signature_algorithm'] = ''
            result['is_self_signed'] = False
            result['public_key'] = ''
            result['san'] = []
            result['key_usage'] = []
            result['ext_key_usage'] = []

        return result

    def _format_dn(self, dn):
        """格式化 DN 为可读字符串"""
        parts = []
        for attr in dn:
            if attr.oid._name:
                parts.append(f"{attr.oid._name}={attr.value}")
            else:
                parts.append(f"{attr.oid.dotted_string}={attr.value}")
        return ', '.join(parts)

    def _parse_sm2_cert_der(self, der_data):
        """纯 Python ASN.1 解析 SM2 国密 X.509 证书（不依赖系统 OpenSSL）"""
        result = {}
        oid_names_dn = {
            '2.5.4.6': 'C', '2.5.4.10': 'O', '2.5.4.11': 'OU', '2.5.4.3': 'CN',
            '2.5.4.5': 'SERIALNUMBER', '2.5.4.7': 'L', '2.5.4.8': 'ST',
            '2.5.4.4': 'SN', '2.5.4.12': 'T', '2.5.4.9': 'STREET',
            '2.5.4.17': 'POSTALCODE', '0.9.2342.19200300.100.1.1': 'UID',
            '1.2.840.113549.1.9.1': 'E', '1.2.86.11': 'GM',
        }
        sig_oid_names = {
            '1.2.156.10197.1.501': 'SM3-SM2',
            '1.2.156.10197.1.504': 'SM3-SM2',
            '1.2.840.10045.4.3.2': 'ECDSA-SHA256',
            '1.2.840.10045.4.3.3': 'ECDSA-SHA384',
            '1.2.840.10045.4.3.4': 'ECDSA-SHA512',
        }

        def read_len(buf, off):
            length = buf[off]; off += 1
            if length & 0x80:
                nlen = length & 0x7f
                length = 0
                for _ in range(nlen):
                    length = (length << 8) | buf[off]; off += 1
            return length, off

        def read_tlv(buf, off):
            tag = buf[off]; off += 1
            length, off = read_len(buf, off)
            value = buf[off:off+length]
            off += length
            return tag, value, off

        def skip_tlv(buf, off):
            tag = buf[off]; off += 1
            length, off = read_len(buf, off)
            off += length
            return off

        def parse_oid(val):
            if not val: return ''
            first = val[0]
            parts = [str(first // 40), str(first % 40)]
            n = 0
            for b in val[1:]:
                n = (n << 7) | (b & 0x7f)
                if not (b & 0x80):
                    parts.append(str(n))
                    n = 0
            return '.'.join(parts)

        def parse_dn(data):
            parts = []
            p = 0
            while p < len(data):
                stag, sv, p = read_tlv(data, p)
                if stag != 0x31:  # SET
                    continue
                sqp = 0
                while sqp < len(sv):
                    setag, sseq, sqp = read_tlv(sv, sqp)
                    if setag != 0x30:  # SEQUENCE
                        continue
                    svp = 0
                    oid_tag, oid_val, svp = read_tlv(sseq, svp)
                    if oid_tag != 0x06:
                        continue
                    oid_str = parse_oid(oid_val)
                    name = oid_names_dn.get(oid_str, oid_str)
                    if svp >= len(sseq):
                        parts.append(f'{name}=?')
                        continue
                    val_tag = sseq[svp]; svp += 1
                    vlen, svp = read_len(sseq, svp)
                    val_bytes = sseq[svp:svp+vlen]
                    if val_tag in (0x0c, 0x1e, 0x16, 0x12, 0x0d, 0x13, 0x14):
                        try:
                            val_str = val_bytes.decode('utf-8', errors='replace')
                        except:
                            val_str = val_bytes.decode('latin1', errors='replace')
                        parts.append(f'{name}={val_str}')
                    else:
                        parts.append(f'{name}={val_bytes.hex()}')
            return ', '.join(parts) if parts else '(解析失败)'

        def parse_time(val):
            try:
                s = val.decode('ascii').strip()
                s = s.rstrip('Z')
                if len(s) == 14:  # Generalized: YYYYMMDDHHMMSS
                    return f'{s[:4]}-{s[4:6]}-{s[6:8]}T{s[8:10]}:{s[10:12]}:{s[12:14]}Z'
                elif len(s) == 12 and s[:2].isdigit() and int(s[:2]) > 50:
                    # UTCTime: YYMMDDHHMMSS (12 chars)
                    yy = 1900 + int(s[:2])
                    return f'{yy}-{s[2:4]}-{s[4:6]}T{s[6:8]}:{s[8:10]}:{s[10:12]}Z'
                elif len(s) == 12 and s[:2].isdigit() and int(s[:2]) <= 50:
                    yy = 2000 + int(s[:2])
                    return f'{yy}-{s[2:4]}-{s[4:6]}T{s[6:8]}:{s[8:10]}:{s[10:12]}Z'
                elif len(s) == 14 and s[:2] == '20':  # Generalized 2000+
                    return f'{s[:4]}-{s[4:6]}-{s[6:8]}T{s[8:10]}:{s[10:12]}:{s[12:14]}Z'
                elif len(s) == 10:  # Generalized: YYYYMMDDHHMM
                    return f'{s[:4]}-{s[4:6]}-{s[6:8]}T{s[8:10]}:{s[10:12]}:00Z'
                return s
            except:
                return str(val.hex())

        def parse_sig_alg(seq_val):
            """从 AlgorithmIdentifier SEQUENCE 提取签名算法名"""
            sp = 0
            while sp < len(seq_val):
                tag, val, sp = read_tlv(seq_val, sp)
                if tag == 0x06:
                    oid_str = parse_oid(val)
                    return sig_oid_names.get(oid_str, f'SM3-SM2(OID:{oid_str})')
            return 'SM3-SM2'

        def parse_pubkey(seq_val):
            """从 SubjectPublicKeyInfo SEQUENCE 提取公钥类型"""
            # AlgorithmIdentifier SEQUENCE: OID + optional params
            sp = 0
            alg_tag, alg_seq, sp = read_tlv(seq_val, sp)
            if alg_tag != 0x30:
                return 'SM2 (国密)'
            ap = 0
            oid_tag, oid_val, ap = read_tlv(alg_seq, ap)
            if oid_tag == 0x06:
                oid_str = parse_oid(oid_val)
                if oid_str == '1.2.156.10197.1.301':
                    return 'SM2 (国密)'
                elif oid_str == '1.2.840.10045.2.1':
                    # EC public key — 第二个 OID 是曲线
                    if ap < len(alg_seq):
                        curve_tag, curve_val, _ = read_tlv(alg_seq, ap)
                        if curve_tag == 0x06:
                            curve_oid = parse_oid(curve_val)
                            if curve_oid == '1.2.156.10197.1.301':
                                return 'SM2 (国密)'
                            else:
                                return f'EC(OID:{curve_oid})'
                    return 'EC'
                return f'EC(OID:{oid_str})'
            return 'SM2 (国密)'

        try:
            p = 0
            # 最外层 SEQUENCE
            tag, cert_val, p = read_tlv(der_data, p)
            if tag != 0x30:
                raise ValueError('Not a DER certificate')

            # TBSCertificate SEQUENCE — 从 cert_val 里读
            tbs_tag, tbs_val, _ = read_tlv(cert_val, 0)
            if tbs_tag != 0x30:
                raise ValueError('No TBSCertificate')

            tp = 0
            # [0] explicit tag for version (v2/v3 only)
            if len(tbs_val) > 0 and tbs_val[0] == 0xa0:
                _, _, tp = read_tlv(tbs_val, 0)
                ver_bytes = tbs_val[3:tp] if tp > 3 else b'\x02'
                ver = int.from_bytes(ver_bytes, 'big') + 1 if len(ver_bytes) <= 2 else 2
                result['version'] = ver
            else:
                result['version'] = 1

            # Serial number (INTEGER)
            tag, ser_val, tp = read_tlv(tbs_val, tp)
            result['serial'] = str(int.from_bytes(ser_val, 'big')) if tag == 0x02 else '(解析失败)'

            # Signature algorithm (SEQUENCE)
            tag, sig_val, tp = read_tlv(tbs_val, tp)
            result['signature_algorithm'] = parse_sig_alg(sig_val) if tag == 0x30 else 'SM3-SM2'

            # Issuer (SEQUENCE of SET)
            tag, iss_val, tp = read_tlv(tbs_val, tp)
            result['issuer'] = parse_dn(iss_val) if tag == 0x30 else '(解析失败)'

            # Validity (SEQUENCE of UTCTime/GeneralizedTime)
            tag, val_val, tp = read_tlv(tbs_val, tp)
            if tag == 0x30:
                vp = 0
                times = []
                while vp < len(val_val):
                    ttag, tval, vp = read_tlv(val_val, vp)
                    if ttag in (0x17, 0x18):  # UTCTime, GeneralizedTime
                        times.append(parse_time(tval))
                result['not_before'] = times[0] if len(times) > 0 else '未知'
                result['not_after'] = times[1] if len(times) > 1 else '未知'
            else:
                result['not_before'] = '未知'
                result['not_after'] = '未知'

            # Subject (SEQUENCE of SET)
            tag, subj_val, tp = read_tlv(tbs_val, tp)
            result['subject'] = parse_dn(subj_val) if tag == 0x30 else '(解析失败)'
            result['is_self_signed'] = result.get('subject') == result.get('issuer')

            # SubjectPublicKeyInfo (SEQUENCE)
            tag, pk_val, tp = read_tlv(tbs_val, tp)
            result['public_key'] = parse_pubkey(pk_val) if tag == 0x30 else 'SM2 (国密)'

            result['san'] = []
            result['key_usage'] = ['digital_signature', 'key_agreement']
            result['ext_key_usage'] = []

        except Exception as e:
            result.setdefault('subject', '(解析失败)')
            result.setdefault('issuer', '(解析失败)')
            result.setdefault('serial', '(解析失败)')
            result.setdefault('version', 0)
            result.setdefault('not_before', '未知')
            result.setdefault('not_after', '未知')
            result.setdefault('signature_algorithm', 'SM3-SM2')
            result.setdefault('is_self_signed', False)
            result.setdefault('public_key', 'SM2 (国密)')
            result.setdefault('san', [])
            result.setdefault('key_usage', ['digital_signature', 'key_agreement'])
            result.setdefault('ext_key_usage', [])
            if 'parse_error' not in result:
                result['cipher_type'] = '国密'
                result['parse_error'] = 'SM2: ' + str(e)

        return result


# ============================================================
# PCAP 文件解析
# ============================================================
def parse_pcap(filepath, target_ip=None):
    """
    解析 PCAP/PCAPNG 文件，提取指定 IP 的 TLS 证书和密码套件
    返回: { 'certificates': [...], 'cipher_suites': [...], 'streams_analyzed': N, 'total_tls_streams': N }
    """
    with open(filepath, 'rb') as f:
        file_header = f.read(4)
        f.seek(0)

        if file_header == b'\xd4\xc3\xb2\xa1' or file_header == b'\xa1\xb2\xc3\xd4':
            pcap = dpkt.pcap.Reader(f)
            is_pcapng = False
        elif file_header == b'\x0a\x0d\x0d\x0a':
            # PCAPNG - 用 pcapng 方式
            pcap = dpkt.pcapng.Reader(f)
            is_pcapng = True
        else:
            raise ValueError("不支持的文件格式，请提供 PCAP 或 PCAPNG 文件")

        reassembler = TLSStreamReassembler()

        for ts, buf in pcap:
            try:
                eth = dpkt.ethernet.Ethernet(buf)
                ip = eth.data
                if not isinstance(ip, dpkt.ip.IP):
                    continue

                src_ip = dpkt.utils.inet_to_str(ip.src)
                dst_ip = dpkt.utils.inet_to_str(ip.dst)

                # ip.data 在 dpkt 1.9.8 中是 bytes，需要构造 TCP
                if ip.p != 6:  # not TCP
                    continue

                tcp = dpkt.tcp.TCP(bytes(ip.data))
                src_port = tcp.sport
                dst_port = tcp.dport

                # 过滤目标 IP（如果指定）
                if target_ip and src_ip != target_ip and dst_ip != target_ip:
                    continue

                if len(tcp.data) > 0:
                    reassembler.add_packet(ts, src_ip, src_port, dst_ip, dst_port, tcp.data)

            except (dpkt.UnpackError, AttributeError, IndexError):
                continue

    # 解析所有 TLS 流
    parser = TLSParser()
    all_results = []
    server_certs = {}  # server_ip -> 证书列表
    server_ciphers = {}  # server_ip -> 协商套件
    server_chains = {}  # server_ip -> 合并后的证书链
    server_hellos = {}  # server_ip -> 第一个完整的 ServerHello

    for stream_key, stream_data in reassembler.streams.items():
        ip1, port1, ip2, port2 = stream_key
        client_data = stream_data['client_data']
        server_data = stream_data['server_data']

        if len(server_data) < 10:
            continue

        # 尝试双向判断哪个是服务端（看 TLS ServerHello 出现在哪边）
        server_ip = None
        server_data_for_role = server_data   # 初步认为 server_data 是服务端发来的
        client_data_for_role = client_data   # 初步认为 client_data 是客户端发来的
        if ip1 == target_ip or ip2 == target_ip:
            # 有目标IP时，目标IP侧发来的数据可能才是服务端的
            # 判断方法：看哪个方向的数据以 TLS ServerHello (0x16 0x03) 开头
            if server_data[:1] == b'\x16' and len(server_data) > 5:
                # server_data 确实是 TLS 记录开头，保持原样
                pass
            elif client_data[:1] == b'\x16' and len(client_data) > 5:
                # client_data 才是 TLS 记录（目标IP是服务端），交换
                server_data_for_role, client_data_for_role = client_data, server_data
                server_ip = target_ip
            else:
                # 无法判断，走默认
                pass
        else:
            # 自动探测：服务端发送 ServerHello(0x02) 的为服务端
            if b'\x16\x03' in server_data[:50]:
                server_ip = ip1 if port1 == 443 else (ip2 if port2 == 443 else ip1)
            else:
                server_ip = ip2 if port1 == 443 else (ip1 if port2 == 443 else ip1)
        
        if server_ip is None:
            # 如果还没确定目标IP是谁，用自动探测
            if b'\x16\x03' in server_data_for_role[:50]:
                server_ip = ip1 if port1 == 443 else (ip2 if port2 == 443 else ip1)
            else:
                server_ip = ip2 if port1 == 443 else (ip1 if port2 == 443 else ip1)
        
        result = parser.parse_stream(client_data_for_role, server_data_for_role, server_ip)

        if target_ip and result['server_ip'] != target_ip:
            continue

        all_results.append(result)

        # 合并证书
        if result['server_ip'] not in server_certs:
            server_certs[result['server_ip']] = []
            server_chains[result['server_ip']] = []
        for cert in result['certificates']:
            # 去重
            if not any(c.get('serial') == cert.get('serial') for c in server_certs[result['server_ip']]):
                server_certs[result['server_ip']].append(cert)

        # 合并证书链（只取第一个完整流的链）
        if result.get('cert_chain') and not server_chains[result['server_ip']]:
            server_chains[result['server_ip']] = result['cert_chain']

        # 合并密码套件
        if result['cipher_suite'] and result['server_ip'] not in server_ciphers:
            server_ciphers[result['server_ip']] = result['cipher_suite']

    # 如果指定了 target_ip 但没找到结果，尝试不过滤 IP 重跑
    if target_ip and not all_results:
        return parse_pcap(filepath, target_ip=None)

    # 无目标 IP 时，对所有发现的服务器汇总
    if not target_ip:
        # 统计哪些是服务端（发送了 ServerHello 的）
        for r in all_results:
            if r['server_hello'] and r['server_ip'] not in server_ciphers:
                server_ciphers[r['server_ip']] = r['cipher_suite'] if r['cipher_suite'] else r['server_hello']
            if r['server_ip'] not in server_certs:
                server_certs[r['server_ip']] = []
                server_chains[r['server_ip']] = []
            for cert in r['certificates']:
                if not any(c.get('serial') == cert.get('serial') for c in server_certs[r['server_ip']]):
                    server_certs[r['server_ip']].append(cert)
            # 合并链
            if r.get('cert_chain') and not server_chains[r['server_ip']]:
                server_chains[r['server_ip']] = r['cert_chain']
            # 合并 ServerHello
            if r.get('server_hello') and r['server_ip'] not in server_hellos:
                server_hellos[r['server_ip']] = r['server_hello']

    return {
        'servers': {
            ip: {
                'ip': ip,
                'certificates': server_certs.get(ip, []),
                'cert_chain': server_chains.get(ip, []),
                'cipher_suite': server_ciphers.get(ip, None),
                'server_hello': server_hellos.get(ip, None),
            }
            for ip in sorted(set(list(server_certs.keys()) + list(server_ciphers.keys())))
        },
        'streams_analyzed': len(all_results),
        'total_tls_streams': len([s for s in reassembler.streams.values() if len(s['server_data']) > 10]),
    }


# ============================================================
# Bottle Web 应用
# ============================================================
app = Bottle()

# 存储最近分析结果
_analysis_cache = {}

@app.route('/')
def index():
    # 优先找 pcap_analyzer.html，其次 index.html
    root = os.path.dirname(os.path.abspath(__file__))
    html_file = 'pcap_analyzer.html'
    html_path = os.path.join(root, html_file)
    if os.path.exists(html_path):
        return static_file(html_file, root=root)
    return static_file('index.html', root=root)

@app.route('/api/ping')
def ping():
    return {'status': 'ok', 'message': '密评抓包分析工具运行中'}

@app.route('/api/analyze', method='POST')
def analyze():
    """分析上传的 PCAP 文件"""
    try:
        upload = request.files.get('file')
        if not upload:
            return HTTPResponse(status=400, body=json.dumps({'error': '请上传 PCAP/PCAPNG 文件'}),
                                headers={'Content-Type': 'application/json'})

        target_ip = request.forms.get('server_ip', '').strip()

        # 保存上传文件
        suffix = '.pcapng' if upload.filename.endswith('.pcapng') else '.pcap'
        with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
            upload.save(tmp)
            tmp_path = tmp.name

        try:
            result = parse_pcap(tmp_path, target_ip if target_ip else None)
        finally:
            os.unlink(tmp_path)

        cache_id = os.urandom(8).hex()
        _analysis_cache[cache_id] = result

        return {
            'ok': True,
            'cache_id': cache_id,
            'filename': upload.filename,
            'server_ip': target_ip or '(全部服务器)',
            'servers_count': len(result['servers']),
            'streams_analyzed': result['streams_analyzed'],
            'total_tls_streams': result['total_tls_streams'],
            'servers': result['servers'],
        }

    except Exception as e:
        return HTTPResponse(status=500, body=json.dumps({
            'error': str(e),
            'traceback': traceback.format_exc(),
        }), headers={'Content-Type': 'application/json'})

@app.route('/api/export/<cache_id>')
def export_pem(cache_id):
    """导出指定服务器证书为 PEM 格式"""
    server_ip = request.query.get('ip', '')
    result = _analysis_cache.get(cache_id)
    if not result:
        return HTTPResponse(status=404, body='分析结果已过期，请重新上传')

    servers = result.get('servers', {})
    if server_ip and server_ip not in servers:
        return HTTPResponse(status=404, body=f'未找到服务器 {server_ip} 的证书')

    pem_parts = []
    if server_ip:
        for cert in servers[server_ip].get('certificates', []):
            der = cert.get('der', '')
            if der:
                try:
                    from base64 import b64decode
                    der_bytes = b64decode(der)
                    cert_obj = x509.load_der_x509_certificate(der_bytes, default_backend())
                    pem = cert_obj.public_bytes(serialization.Encoding.PEM).decode()
                    pem_parts.append(pem)
                except:
                    pem_parts.append(f"# 证书 (无法解析为 PEM, DER:{len(der)} bytes)\n")
    else:
        for sip, srv in servers.items():
            for cert in srv.get('certificates', []):
                der = cert.get('der', '')
                if der:
                    try:
                        from base64 import b64decode
                        der_bytes = b64decode(der)
                        cert_obj = x509.load_der_x509_certificate(der_bytes, default_backend())
                        pem = cert_obj.public_bytes(serialization.Encoding.PEM).decode()
                        pem_parts.append(f"# 服务器: {sip}\n{pem}")
                    except:
                        pass

    return HTTPResponse(
        body='\n'.join(pem_parts) if pem_parts else '# 未找到可导出的证书',
        headers={
            'Content-Type': 'application/x-pem-file',
            'Content-Disposition': 'attachment; filename="certificates.pem"',
        }
    )


if __name__ == '__main__':
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 3346
    print(f"=" * 60)
    print(f"  密评抓包分析工具 v1.0")
    print(f"  监听端口: {port}")
    print(f"  浏览器访问: http://localhost:{port}/")
    print(f"  PCAP 文件格式: PCAP / PCAPNG")
    print(f"=" * 60)
    app.run(host='0.0.0.0', port=port, debug=True)
