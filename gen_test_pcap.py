#!/usr/bin/env python3
"""生成测试 PCAP 文件，包含 TLS 握手"""
import struct, time, socket, dpkt

from cryptography import x509
from cryptography.x509.oid import NameOID
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import rsa
from cryptography.hazmat.backends import default_backend
import datetime

key = rsa.generate_private_key(public_exponent=65537, key_size=2048, backend=default_backend())
subject = issuer = x509.Name([
    x509.NameAttribute(NameOID.COUNTRY_NAME, 'CN'),
    x509.NameAttribute(NameOID.STATE_OR_PROVINCE_NAME, 'Beijing'),
    x509.NameAttribute(NameOID.ORGANIZATION_NAME, 'Test Corp'),
    x509.NameAttribute(NameOID.COMMON_NAME, 'test.example.com'),
])
cert = (
    x509.CertificateBuilder()
    .subject_name(subject)
    .issuer_name(issuer)
    .public_key(key.public_key())
    .serial_number(123456789)
    .not_valid_before(datetime.datetime.now(datetime.timezone.utc))
    .not_valid_after(datetime.datetime.now(datetime.timezone.utc) + datetime.timedelta(days=365))
    .add_extension(x509.BasicConstraints(ca=True, path_length=None), critical=True)
    .add_extension(
        x509.SubjectAlternativeName([
            x509.DNSName('test.example.com'),
            x509.DNSName('www.example.com'),
        ]), critical=False)
    .sign(key, hashes.SHA256(), backend=default_backend())
)
cert_der = cert.public_bytes(serialization.Encoding.DER)

def len3(v):
    return bytes([v >> 16 & 0xff, v >> 8 & 0xff, v & 0xff])

def handshake_bytes(hs_type, body):
    return bytes([hs_type]) + len3(len(body)) + body

def tls_record(content_type, version, data):
    return bytes([content_type, version >> 8 & 0xff, version & 0xff]) + struct.pack('!H', len(data)) + data

# ── ClientHello (TLS 1.2) ──
ch_body = (b'\x03\x03' + bytes(range(32)) + b'\x00' +
           b'\x00\x0c' + b'\x13\x01\x13\x02\x13\x03\xc0\x2b\xc0\x2f\x00\x9c' +
           b'\x01\x00')
ch_handshake = handshake_bytes(1, ch_body)
ch_record = tls_record(22, 0x0303, ch_handshake)

# ── ServerHello (0xC030 = TLS_ECDHE_RSA_WITH_AES_256_GCM_SHA384) ──
srv_session = bytes(range(10))
sh_body = (b'\x03\x03' + bytes(range(32, 64)) +
           bytes([len(srv_session)]) + srv_session +
           b'\xc0\x30' + b'\x00')
sh_handshake = handshake_bytes(2, sh_body)

# ── Certificate ──
cert_cert = len3(len(cert_der)) + cert_der
cert_body = len3(3 + len(cert_der)) + cert_cert
cert_handshake = handshake_bytes(11, cert_body)

# ── ServerHelloDone ──
shd_handshake = handshake_bytes(14, b'')

# ── 打包服务端数据 ──
server_combined = sh_handshake + cert_handshake + shd_handshake
server_record = tls_record(22, 0x0303, server_combined)

# ── 构造包 ──
CLIENT_MAC = b'\x00\x11\x22\x33\x44\x55'
SERVER_MAC = b'\x66\x77\x88\x99\xaa\xbb'
CLIENT_IP  = b'\xc0\xa8\x01\x64'
SERVER_IP  = b'\xcb\x00\x71\x0a'

def make_tcp_data(src_ip, dst_ip, sport, dport, seq, ack, flags, payload=b''):
    """构造 TCP segment bytes"""
    doff = 5  # 20 bytes header
    tcp_hdr = struct.pack('!HHIIBBHHH',
        sport, dport, seq, ack,
        (doff << 4), flags, 65535, 0, 0)
    return tcp_hdr + payload

def make_pkt(src_mac, dst_mac, src_ip, dst_ip, sport, dport,
             seq, ack, flags, payload=b''):
    """构造 Ethernet + IP + TCP 包的完整 bytes"""
    # TCP
    tcp_bytes = make_tcp_data(src_ip, dst_ip, sport, dport, seq, ack, flags, payload)
    # IP
    ip_total_len = 20 + len(tcp_bytes)
    ip_hdr = struct.pack('!BBHHHBBH4s4s',
        0x45, 0, ip_total_len, 0, 0, 64, 6, 0,   # protocol=6(TCP)
        src_ip, dst_ip)
    # IP checksum
    checksum = 0
    for i in range(0, len(ip_hdr), 2):
        checksum += (ip_hdr[i] << 8) + ip_hdr[i+1]
    while checksum >> 16:
        checksum = (checksum & 0xffff) + (checksum >> 16)
    ip_hdr = ip_hdr[:10] + struct.pack('!H', ~checksum & 0xffff) + ip_hdr[12:]
    # Ethernet
    eth = struct.pack('!6s6sH', dst_mac, src_mac, 0x0800)
    return eth + ip_hdr + tcp_bytes

SPORT, DPORT = 54321, 443
now = time.time()

w = dpkt.pcap.Writer(open('/tmp/test_tls.pcap', 'wb'), snaplen=65535)

def pkt(ts, smac, dmac, sip, dip, sp, dp, seq, ack, fl, data=b''):
    w.writepkt(make_pkt(smac, dmac, sip, dip, sp, dp, seq, ack, fl, data), ts=ts)

pkt(now,       CLIENT_MAC, SERVER_MAC, CLIENT_IP, SERVER_IP, SPORT, DPORT, 100, 0,    0x02)
pkt(now+0.001, SERVER_MAC, CLIENT_MAC, SERVER_IP, CLIENT_IP, DPORT, SPORT, 200, 101,  0x12)
pkt(now+0.002, CLIENT_MAC, SERVER_MAC, CLIENT_IP, SERVER_IP, SPORT, DPORT, 101, 201,  0x10)
pkt(now+0.003, CLIENT_MAC, SERVER_MAC, CLIENT_IP, SERVER_IP, SPORT, DPORT, 101, 201,  0x18, ch_record)
pkt(now+0.004, SERVER_MAC, CLIENT_MAC, SERVER_IP, CLIENT_IP, DPORT, SPORT, 201, 101+len(ch_record),
    0x18, server_record)

w.close()
print('✅ 测试 PCAP 已生成: /tmp/test_tls.pcap')
print(f'   服务器 IP: 203.0.113.10')
print(f'   证书 CN: test.example.com')
print(f'   密码套件: TLS_ECDHE_RSA_WITH_AES_256_GCM_SHA384 (0xC030)')
