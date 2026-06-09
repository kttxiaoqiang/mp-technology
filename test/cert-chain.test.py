#!/usr/bin/env python3
"""测试证书链排序 + 服务器证书标注"""
import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

# 模拟 cryptography 库可用
import unittest
from unittest.mock import patch
from pcap_analyzer import TLSParser

class TestCertChain(unittest.TestCase):
    def setUp(self):
        self.parser = TLSParser()

    def _make_cert(self, cn, issuer_cn, serial):
        """造一个模拟证书 dict"""
        return {
            'serial': str(serial),
            'subject': f'CN={cn}',
            'issuer': f'CN={issuer_cn}',
        }

    def test_single_cert_is_chain(self):
        """行为：单个证书时链只有一项，且是服务器证书"""
        certs = [self._make_cert('server.example.com', 'RootCA', 1)]
        chains = self.parser.build_cert_chain(certs)
        self.assertEqual(len(chains), 1)
        self.assertEqual(len(chains[0]['chain']), 1)
        self.assertTrue(chains[0]['chain'][0]['is_server_cert'])
        self.assertEqual(chains[0]['chain'][0]['cert']['serial'], '1')

    def test_full_chain_three_levels(self):
        """行为：三级链（叶子→中级→根）按正确顺序排列"""
        certs = [
            self._make_cert('server.example.com', 'IntermediateCA', 3),
            self._make_cert('RootCA', 'RootCA', 1),   # 根证书自签名
            self._make_cert('IntermediateCA', 'RootCA', 2),
        ]
        chains = self.parser.build_cert_chain(certs)
        self.assertEqual(len(chains), 1)
        chain = chains[0]['chain']
        # 顺序应该是 叶子 → 中级 → 根
        self.assertEqual(chain[0]['cert']['serial'], '3')
        self.assertTrue(chain[0]['is_server_cert'])
        self.assertEqual(chain[1]['cert']['serial'], '2')
        self.assertFalse(chain[1]['is_server_cert'])
        self.assertEqual(chain[2]['cert']['serial'], '1')
        self.assertFalse(chain[2]['is_server_cert'])

    def test_self_signed_root(self):
        """行为：自签名证书（Subject == Issuer）正确认到链尾"""
        certs = [
            self._make_cert('server.example.com', 'MyCA', 2),
            self._make_cert('MyCA', 'MyCA', 1),   # 自签名
        ]
        chains = self.parser.build_cert_chain(certs)
        self.assertEqual(len(chains), 1)
        self.assertEqual(len(chains[0]['chain']), 2)
        self.assertEqual(chains[0]['chain'][1]['cert']['serial'], '1')

    def test_two_separate_chains(self):
        """行为：两套独立证书各成一条链"""
        certs = [
            self._make_cert('server-a.com', 'CA-A', 10),
            self._make_cert('CA-A', 'CA-A', 11),
            self._make_cert('server-b.com', 'CA-B', 20),
            self._make_cert('CA-B', 'CA-B', 21),
        ]
        chains = self.parser.build_cert_chain(certs)
        self.assertEqual(len(chains), 2)
        # 每条链第一步都是服务器证书
        self.assertTrue(chains[0]['chain'][0]['is_server_cert'])
        self.assertTrue(chains[1]['chain'][0]['is_server_cert'])

    def test_cert_not_in_chain_dropped(self):
        """行为：无法锚定到根的证书作为单节点链"""
        certs = [
            self._make_cert('server.example.com', 'UnknownCA', 99),
            # 没有 UnknownCA 的证书
        ]
        chains = self.parser.build_cert_chain(certs)
        self.assertEqual(len(chains), 1)
        self.assertEqual(len(chains[0]['chain']), 1)
        self.assertTrue(chains[0]['chain'][0]['is_server_cert'])

    def test_empty_certs(self):
        """行为：空列表返回空链"""
        chains = self.parser.build_cert_chain([])
        self.assertEqual(len(chains), 0)

    def test_parse_stream_includes_cert_chain(self):
        """行为：parse_stream 结果包含 cert_chain 字段"""
        result = self.parser.parse_stream(b'', b'', '10.0.0.1')
        self.assertIn('cert_chain', result)
        self.assertIsInstance(result['cert_chain'], list)


if __name__ == '__main__':
    unittest.main()
