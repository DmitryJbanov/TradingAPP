"""Open the map using the site's router or bounded RU/EN 404 fallbacks."""
import re

from login_flow import LoginFlow, ORIGIN, safe_path, error_code, PASSWORD

MAP_PATHS = ('/ru/pro/futures/LiquidationMap', '/pro/futures/LiquidationMap')
MAP_HEADING = re.compile(r'^(?:Карта Ликвидаций Биржи .+|.+ Exchange Liquidation Map)$')
SEARCH_NAME = re.compile(r'^(?:Поиск|Search)$')
PERIOD_90 = re.compile(r'^90\s+(?:день|дней|day|days)$', re.I)
MAP_LINK = ', '.join(f'a[href="{path}"]:visible' for path in MAP_PATHS)


class MapNavigationError(RuntimeError):
    """Messages contain only fixed descriptions and numeric HTTP statuses."""


class MapNavigator:
    def __init__(self, page, report=None):
        self.page = page
        self.report = report or (lambda message: print(message, flush=True))
        self.guard = LoginFlow(page, report=self.report)
        self.status = None
        self.steps = []
        self.method = 'site_link'

    def on_response(self, response):
        if response.request.resource_type == 'document' and response.request.frame == self.page.main_frame:
            self.status = response.status
            self.steps.append(dict(method=self.method, path=safe_path(response.url), http_status=response.status))
            self.steps = self.steps[-12:]

    def check(self):
        self.guard.status = self.status
        self.guard.check_page()
        self.guard.check_additional_verification()
        if self.status is not None and self.status >= 400 and self.status != 404:
            raise MapNavigationError(f'Страница карты вернула HTTP {self.status}; сбор остановлен.')

    def is_map(self):
        self.check()
        if self.status == 404:
            return False
        if safe_path(self.page.url) not in MAP_PATHS:
            raise MapNavigationError('Открытие карты перенаправило на другую страницу; доступ к карте не подтверждён.')
        if self.page.locator(PASSWORD).count():
            raise MapNavigationError('При открытии карты появилась форма входа; сессия не принята.')
        return True

    def goto(self, path, method):
        self.method, self.status = method, None
        response = self.page.goto(ORIGIN + path, wait_until='domcontentloaded', timeout=60000)
        if response is not None:
            self.status = response.status
        self.report(f'Карта: {path}, HTTP {self.status or "неизвестен"} ({method})')
        self.check()

    def site_link(self):
        if safe_path(self.page.url) == 'external_or_blank':
            return False
        self.check()
        self.guard.dismiss_cookies()
        link = self.page.locator(MAP_LINK).first
        if not link.is_visible():
            # Verified public menu: hover Liquidation, then click Liquidation Map.
            menu = self.page.get_by_role('banner').locator(
                'a[href="/liquidations"], a[href="/ru/liquidations"]').first
            if not menu.is_visible():
                return False
            try:
                menu.hover(timeout=3000)
                link.wait_for(state='visible', timeout=5000)
            except Exception as error:
                self.check()
                if error_code(error) not in {'timeout', 'navigation_changed_dom'}:
                    raise
                return False
        self.method, self.status = 'site_link', None
        try:
            link.click(timeout=15000)
            self.page.wait_for_url(re.compile(r'^https://www\.coinglass\.com/(?:ru/)?pro/futures/LiquidationMap(?:[?#].*)?$'),
                                   wait_until='domcontentloaded', timeout=15000)
        except Exception as error:
            self.check()
            if error_code(error) not in {'timeout', 'navigation_changed_dom'}:
                raise
            if safe_path(self.page.url) not in MAP_PATHS:
                return False
        result = self.is_map()
        self.steps.append(dict(method='site_link', path=safe_path(self.page.url), http_status=self.status))
        self.report(f'Карта: переход через меню, HTTP {self.status or "без нового документа"}')
        return result

    def open(self):
        callback = self.on_response
        self.page.on('response', callback)
        try:
            if self.site_link():
                return
            for path in MAP_PATHS:
                self.goto(path, 'direct')
                if self.is_map():
                    return
            # The server can reject deep links while the application router works.
            self.goto('/', 'bootstrap')
            if self.status != 404 and self.site_link():
                return
            raise MapNavigationError('Карта недоступна: прямые адреса вернули HTTP 404, '
                                     'переход через меню не открыл карту.')
        finally:
            self.page.remove_listener('response', callback)


def symbol_heading(symbol):
    return re.compile(r'^(?:Карта Ликвидаций Биржи ' + re.escape(symbol)
                      + '|' + re.escape(symbol) + r' Exchange Liquidation Map)$')
