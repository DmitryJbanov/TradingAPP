"""Opt-in real Chromium checks: COINGLASS_BROWSER_TESTS=1 python -m unittest test_tooltip_browser."""
import os
import time
import unittest

from collector import hover_tooltip


@unittest.skipUnless(os.environ.get('COINGLASS_BROWSER_TESTS') == '1', 'requires Chromium')
class TooltipBrowserTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        from playwright.sync_api import sync_playwright
        cls.pw = sync_playwright().start()
        cls.browser = cls.pw.chromium.launch(channel='chromium', headless=True)

    @classmethod
    def tearDownClass(cls):
        cls.browser.close()
        cls.pw.stop()

    def setUp(self):
        self.page = self.browser.new_page()
        self.page.set_content('''
          <div id="chart" style="margin:40px;width:800px;height:400px">
            <canvas width="800" height="400"></canvas>
            <div class="cg-toolti-box" style="position:absolute;pointer-events:none"></div>
          </div>
          <script>
            window.delay = 0; window.disabled = false; window.partial = false;
            const canvas = document.querySelector('canvas');
            const box = document.querySelector('.cg-toolti-box');
            canvas.addEventListener('mousemove', event => {
              if (window.disabled) return;
              const price = 100 + Math.floor(event.offsetX / 10);
              setTimeout(() => {
                box.innerHTML = `<div class="cg-toolti-title">${price}</div>
                  <div class="cg-tooltip-item"><div class="cg-tooltip-item-title">Binance</div>
                  <div class="pl20">${window.partial ? '' : '66.54M'}</div></div>`;
                if (window.partial) setTimeout(() => {
                  box.querySelector('.pl20').textContent = '66.54M';
                }, 90);
              }, window.delay);
            });
          </script>
        ''')
        self.chart = self.page.locator('#chart')
        self.bounds = self.chart.locator('canvas').bounding_box()

    def tearDown(self):
        self.page.close()

    def read(self, dx=100, timeout=1000):
        return hover_tooltip(self.page, self.chart, self.bounds, dx, timeout)

    def test_fast_updates_return_before_timeout_and_keep_duplicate_categories(self):
        started = time.monotonic()
        first, second = self.read(100), self.read(101)
        elapsed = time.monotonic() - started
        self.assertEqual(first, second)
        self.assertEqual(first['title'], '110')
        self.assertLess(elapsed, 1.0)  # Two fixed waits would take two seconds.

    def test_waits_for_delayed_complete_html(self):
        self.page.evaluate('window.delay = 60; window.partial = true')
        raw = self.read()
        self.assertEqual(raw['items'][0]['value'], '66.54M')

    def test_timeout_does_not_return_previous_tooltip(self):
        self.assertEqual(self.read()['title'], '110')
        self.page.evaluate('window.disabled = true')
        self.assertIsNone(self.read(200, 80))

    def test_same_category_with_position_only_update(self):
        self.read(100)
        self.page.evaluate('''() => {
          window.disabled = true;
          document.querySelector('canvas').addEventListener('mousemove', e => {
            document.querySelector('.cg-toolti-box').style.left = e.clientX + 'px';
          });
        }''')
        self.assertEqual(self.read(101)['title'], '110')

    def test_does_not_leave_canvas_between_pixels(self):
        self.read(100)
        self.page.evaluate('''() => {
          window.exits = 0;
          document.querySelector('canvas').addEventListener('mouseleave', () => window.exits++);
        }''')
        self.read(101)
        self.read(102)
        self.assertEqual(self.page.evaluate('window.exits'), 0)

    def test_each_pixel_preserves_narrow_category_boundaries(self):
        values = [self.read(dx)['title'] for dx in range(98, 103)]
        self.assertEqual(values, ['109', '109', '110', '110', '110'])
