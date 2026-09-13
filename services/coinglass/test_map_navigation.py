import unittest
from decimal import Decimal

from collector import parse_tooltip
from login_flow import ORIGIN, LoginError
from map_navigation import MapNavigator, MapNavigationError, MAP_PATHS, MAP_LINK, MAP_HEADING, PERIOD_90
from test_login_flow import Page


class MapLink:
    def __init__(self, page, menu=False):
        self.page, self.menu = page, menu
        self.first = self

    def locator(self, selector):
        return MapLink(self.page, menu=True)

    def is_visible(self):
        if self.menu:
            return self.page.menu_available and self.page.url == ORIGIN + '/'
        return self.page.link_available

    def hover(self, **kwargs):
        self.page.link_available = True

    def wait_for(self, **kwargs):
        if not self.is_visible():
            raise TimeoutError('absent')

    def click(self, **kwargs):
        p = self.page
        p.actions.append('map_link')
        p.url, p.mode = ORIGIN + p.link_path, 'map'
        if p.link_status is not None:
            p.respond(p.link_status)


class MapPage(Page):
    def __init__(self):
        super().__init__()
        self.url, self.mode = ORIGIN + '/account', 'landing'
        self.link_available = self.menu_available = False
        self.link_path = MAP_PATHS[1]
        self.link_status = None
        self.routes = {MAP_PATHS[0]: (404, 'error'), MAP_PATHS[1]: (200, 'map'), '/': (200, 'home')}

    def locator(self, selector):
        if selector == MAP_LINK:
            return MapLink(self)
        return super().locator(selector)

    def get_by_role(self, role, **kwargs):
        if role == 'banner':
            return MapLink(self, menu=True)
        return super().get_by_role(role, **kwargs)

    def wait_for_url(self, pattern, **kwargs):
        if not pattern.search(self.url):
            raise TimeoutError('wrong route')


class MapNavigationTests(unittest.TestCase):
    def run_nav(self, page):
        self.messages = []
        self.nav = MapNavigator(page, report=self.messages.append)
        self.nav.open()

    def test_ru_404_falls_back_to_english_without_waiting_for_chart(self):
        page = MapPage()
        self.run_nav(page)
        self.assertEqual(page.actions, list(MAP_PATHS))
        self.assertEqual(self.nav.status, 200)
        self.assertEqual([s['http_status'] for s in self.nav.steps], [404, 200])
        self.assertTrue(any('HTTP 404' in message for message in self.messages))
        self.assertEqual(page.listeners, {})

    def test_working_ru_route_does_not_try_english(self):
        page = MapPage()
        page.routes[MAP_PATHS[0]] = (200, 'map')
        self.run_nav(page)
        self.assertEqual(page.actions, [MAP_PATHS[0]])

    def test_visible_site_link_preserves_spa_navigation(self):
        page = MapPage()
        page.link_available = True
        self.run_nav(page)
        self.assertEqual(page.actions, ['map_link'])
        self.assertIsNone(self.nav.status)
        self.assertEqual(self.nav.steps[-1]['method'], 'site_link')

    def test_two_deep_link_404s_recover_through_home_menu(self):
        page = MapPage()
        page.routes[MAP_PATHS[1]] = (404, 'error')
        page.menu_available = True
        self.run_nav(page)
        self.assertEqual(page.actions, [*MAP_PATHS, '/', 'map_link'])
        self.assertIsNone(self.nav.status)  # Do not inherit homepage's HTTP 200.

    def test_no_working_route_returns_explicit_404_error(self):
        page = MapPage()
        page.routes[MAP_PATHS[1]] = (404, 'error')
        with self.assertRaisesRegex(MapNavigationError, 'HTTP 404'):
            self.run_nav(page)
        self.assertEqual(page.actions, [*MAP_PATHS, '/'])
        self.assertEqual(page.listeners, {})

    def test_blocking_status_or_challenge_stops_route_fallback(self):
        for status, mode in [(403, 'error'), (429, 'error'), (500, 'error'), (200, 'challenge')]:
            page = MapPage()
            page.routes[MAP_PATHS[0]] = (status, mode)
            with self.assertRaises((MapNavigationError, LoginError)):
                self.run_nav(page)
            self.assertEqual(page.actions, [MAP_PATHS[0]])

    def test_password_form_on_map_is_not_accepted(self):
        page = MapPage()
        page.routes[MAP_PATHS[0]] = (200, 'form')
        with self.assertRaisesRegex(MapNavigationError, 'форма входа'):
            self.run_nav(page)
        self.assertEqual(page.actions, [MAP_PATHS[0]])

    def test_heading_selects_aggregate_map_only_in_both_languages(self):
        for name in ['Карта Ликвидаций Биржи Биткоин', 'Bitcoin Exchange Liquidation Map', 'ETH Exchange Liquidation Map']:
            self.assertRegex(name, MAP_HEADING)
        for name in ['Binance BTC/USDT Liquidation Map', 'Hyperliquid Liquidation Map']:
            self.assertIsNone(MAP_HEADING.search(name))

    def test_period_remains_exactly_90_days(self):
        for name in ['90 день', '90 дней', '90 day', '90 days']:
            self.assertRegex(name, PERIOD_90)
        for name in ['180 day', '190 day', '90 day Premium', '1 day']:
            self.assertIsNone(PERIOD_90.search(name))

    def test_english_tooltips_keep_side_and_exchange_intensity(self):
        for label, side in [('Cumulative Long Liquidation Leverage', 'long'),
                            ('Cumulative Short Liquidation Leverage', 'short')]:
            point = parse_tooltip({'title': '74320', 'items': [
                {'name': label, 'value': '649.98M'}, {'name': 'Binance', 'value': '4.91M'},
                {'name': 'OKX', 'value': '2.37M'}, {'name': 'Bybit', 'value': '2.74M'}]})
            self.assertEqual(point['side'], side)
            self.assertEqual(point['intensity'], Decimal('10020000'))


if __name__ == '__main__':
    unittest.main()
