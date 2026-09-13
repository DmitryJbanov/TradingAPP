import json
import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import MagicMock, patch

from auth import LoginError, is_site_url, read_credentials, save_session


class AuthenticationTests(unittest.TestCase):
    def test_special_characters_are_preserved(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / 'credentials.txt'
            path.write_text('\ufeff# comment\nemail= example@example.invalid \n'
                            'password= #a=b%;"\\ tail \n', encoding='utf-8')
            self.assertEqual(read_credentials(path),
                             ('example@example.invalid', ' #a=b%;"\\ tail '))

    def test_invalid_credentials_do_not_echo_contents(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / 'credentials.txt'
            for text in ['secret_value', 'email=x\npassword=',
                         'email=x\npassword=secret_value\npassword=duplicate']:
                path.write_text(text, encoding='utf-8')
                with self.assertRaises(LoginError) as result:
                    read_credentials(path)
                self.assertNotIn('secret_value', str(result.exception))

    def test_session_write_and_replace(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / 'session.json'
            context = MagicMock()
            context.storage_state.return_value = {'cookies': [], 'origins': []}
            save_session(context, path)
            self.assertEqual(json.loads(path.read_text()), {'cookies': [], 'origins': []})
            context.storage_state.return_value = {'cookies': [], 'origins': [{'origin': 'test'}]}
            save_session(context, path)
            self.assertEqual(json.loads(path.read_text())['origins'], [{'origin': 'test'}])
            self.assertEqual(len(list(Path(tmp).iterdir())), 1)
            if os.name == 'posix':
                self.assertEqual(path.stat().st_mode & 0o777, 0o600)

    def test_login_origin_is_exact(self):
        self.assertTrue(is_site_url('https://www.coinglass.com/ru/login'))
        for url in ['http://www.coinglass.com/ru/login',
                    'https://www.coinglass.com.example.org/ru/login',
                    'https://other.example.org/ru/login']:
            self.assertFalse(is_site_url(url))

if __name__ == '__main__':
    unittest.main()
