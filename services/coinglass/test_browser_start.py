import errno
import json
import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import MagicMock, patch

from browser_runtime import (AUTH_REVISION, BrowserStartError, create_page,
                             launch_browser, prepare_browser_dirs)
from diagnose import latest_report


class BrowserStartTests(unittest.TestCase):
    def test_config_and_cache_are_created_and_writable(self):
        with tempfile.TemporaryDirectory() as tmp:
            config, cache = Path(tmp) / 'config', Path(tmp) / 'cache'
            with patch.dict(os.environ, {'XDG_CONFIG_HOME': str(config), 'XDG_CACHE_HOME': str(cache)}):
                prepare_browser_dirs()
            self.assertTrue(config.is_dir())
            self.assertTrue(cache.is_dir())
            self.assertEqual(list(config.iterdir()) + list(cache.iterdir()), [])

    def test_readonly_directory_stops_before_browser_launch(self):
        pw = MagicMock()
        with tempfile.TemporaryDirectory() as tmp, \
                patch('browser_runtime.prepare_browser_dirs', side_effect=OSError(errno.EROFS, 'Read-only file system')):
            with self.assertRaisesRegex(BrowserStartError, 'read_only_filesystem'):
                launch_browser(pw, Path(tmp) / 'runs' / 'failed')
            state = latest_report(tmp)['diagnostic']
            self.assertEqual(state['stage'], 'browser_directories')
            self.assertEqual(state['revision'], AUTH_REVISION)
            self.assertEqual(state['credential_submission'], 'not_sent')
        pw.chromium.launch.assert_not_called()

    def test_launch_failure_has_current_diagnostic_without_raw_stderr(self):
        pw = MagicMock()
        pw.chromium.launch.side_effect = RuntimeError('secret_value chromium_crashpad_handler: --database is required SIGTRAP')
        with tempfile.TemporaryDirectory() as tmp, patch('browser_runtime.prepare_browser_dirs'):
            with self.assertRaises(BrowserStartError) as error:
                launch_browser(pw, Path(tmp) / 'runs' / 'current')
            state = latest_report(tmp)['diagnostic']
            self.assertEqual(state['stage'], 'browser_launch')
            self.assertEqual(state['signals'], ['crashpad', 'sigtrap'])
            self.assertNotIn('secret_value', json.dumps(state) + str(error.exception))

    def test_session_creation_failure_does_not_echo_session_contents(self):
        browser = MagicMock()
        browser.new_context.side_effect = RuntimeError('Invalid cookie secret_value')
        with tempfile.TemporaryDirectory() as tmp:
            with self.assertRaises(BrowserStartError) as error:
                create_page(browser, {'storage_state': {'cookies': ['secret_value']}}, tmp)
            state = json.loads((Path(tmp) / 'login-state.json').read_text())
            self.assertEqual(state['stage'], 'context_create')
            self.assertNotIn('secret_value', json.dumps(state) + str(error.exception))

    def test_page_creation_failure_is_diagnosed_separately(self):
        browser = MagicMock()
        browser.new_context.return_value.new_page.side_effect = RuntimeError('Target closed')
        with tempfile.TemporaryDirectory() as tmp:
            with self.assertRaisesRegex(BrowserStartError, 'page_create'):
                create_page(browser, {}, tmp)
            state = json.loads((Path(tmp) / 'login-state.json').read_text())
            self.assertEqual(state['stage'], 'page_create')
            self.assertEqual(state['signals'], [])


if __name__ == '__main__':
    unittest.main()
