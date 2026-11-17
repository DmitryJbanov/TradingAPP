"""Locate CoinGlass's current page client by endpoint signatures, not build IDs."""

CLIENT_JS = r'''() => {
  const chunks = self.webpackChunk_N_E;
  if (!Array.isArray(chunks) || chunks.push === Array.prototype.push)
    throw new Error('CoinGlass runtime unavailable');
  let req;
  chunks.push([[`divmoney_client_${Date.now()}_${Math.random()}`], {}, r => {req = r;}]);
  if (!req?.m) throw new Error('CoinGlass runtime unavailable');
  const id = Object.keys(req.m).find(id => {
    const source = String(req.m[id]);
    return source.includes('/api/index/v4/aggregate/liqHeatMap') && source.includes('/api/liquidationLevels/v2');
  });
  if (!id) throw new Error('CoinGlass API module unavailable');
  const api = req(id);
  const find = path => {
    const entries = Object.values(api).filter(fn => typeof fn === 'function' &&
      [...String(fn).matchAll(/["']([^"']*\/api\/[^"']+)["']/g)].some(match => {
        try {return path.startsWith('https://') ? match[1] === path : new URL(match[1], 'https://www.coinglass.com').pathname === path;}
        catch {return false;}
      }));
    if (entries.length !== 1) throw new Error('CoinGlass endpoint unavailable: '+path);
    return entries[0];
  };
  const call = async (path, params) => {
    let timer;
    try {return await Promise.race([
      find(path)(params),
      new Promise((_, reject) => {timer=setTimeout(()=>reject(new Error('CoinGlass request timeout')),60000);})
    ]);} finally {clearTimeout(timer);}
  };
  return {api, find, call};
}'''

READY_JS = '() => {try {return !!(' + CLIENT_JS + ')().api;} catch {return false;}}'
FETCH_JS = 'async ({path,params}) => {const {call}=(' + CLIENT_JS + ')(); return await call(path,params);}'


def fetch_frontend(page, path, params):
    page.wait_for_function(READY_JS, timeout=45000)
    return page.evaluate(FETCH_JS, {'path': path, 'params': params})
