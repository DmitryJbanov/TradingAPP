import json, math
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent
src = ROOT / 'coinglass_btc_liquidation_price_levels_365d.json'
out = ROOT / 'coinglass_btc_liquidation_map_365d.png'
d = json.loads(src.read_text(encoding='utf-8'))
levels, axis = d['price_levels'], d['y']
nx, ny = max(p['x_index'] for p in levels) + 1, len(axis)
grid = [[0.0] * nx for _ in range(ny)]
for p in levels:
    if 0 <= p['y_index'] < ny and 0 <= p['x_index'] < nx:
        grid[p['y_index']][p['x_index']] = max(grid[p['y_index']][p['x_index']], float(p['liquidation_value']))
mx = max(max(row) for row in grid)
den = math.log1p(mx)
W, H, left, top, right, bottom = 1500, 900, 90, 55, 40, 80
cw, ch = (W-left-right)/nx, (H-top-bottom)/ny
im = Image.new('RGB', (W, H), (18, 20, 28)); pix = im.load()
stops = [(0,(20,25,45)),(.2,(38,48,110)),(.45,(90,35,150)),(.7,(190,45,75)),(.88,(245,120,35)),(1,(255,225,70))]
def color(v):
    t = math.log1p(v)/den if v else 0
    for i in range(1, len(stops)):
        if t <= stops[i][0]:
            a,c1=stops[i-1]; b,c2=stops[i]; q=(t-a)/(b-a)
            return tuple(int(c1[k]+q*(c2[k]-c1[k])) for k in range(3))
    return stops[-1][1]
for yi, row in enumerate(grid):
    y0=int(top+(ny-1-yi)*ch); y1=max(y0+1,int(top+(ny-yi)*ch))
    for xi,v in enumerate(row):
        if v:
            x0=int(left+xi*cw); x1=max(x0+1,int(left+(xi+1)*cw)); c=color(v)
            for xx in range(x0,x1):
                for yy in range(y0,y1): pix[xx,yy]=c
draw=ImageDraw.Draw(im); font=ImageFont.load_default()
draw.text((left,18),'CoinGlass BTC Liquidation Heatmap - Model 3 / Symbol / 365d',fill=(235,238,245),font=font)
draw.text((left,H-55),'time index ->',fill=(180,185,200),font=font)
for i in range(6):
    yi=int(i*(ny-1)/5); yy=int(top+(ny-1-yi)*ch)
    draw.text((8,yy-6),f'{axis[yi]:,.0f}',fill=(190,195,210),font=font)
for i in range(6):
    xi=int(i*(nx-1)/5); xx=int(left+xi*cw)
    draw.text((xx-10,H-bottom+12),str(xi),fill=(190,195,210),font=font)
lx,ly=W-180,top+10; draw.text((lx,ly-20),'relative intensity',fill=(200,205,220),font=font)
for i in range(6):
    yy=ly+i*18; draw.rectangle((lx,yy,lx+22,yy+14),fill=color(mx*i/5)); draw.text((lx+30,yy),f'{i*20}%',fill=(190,195,210),font=font)
im.save(out, optimize=True); print(out.resolve())
