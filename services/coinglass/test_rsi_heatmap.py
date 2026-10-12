import unittest
from rsi_heatmap_worker import normalize_rows, RsiHeatmapError

class RsiSnapshotTests(unittest.TestCase):
    def source(self):
        return [dict(rank=i, symbol=f'C{i}', price=100+i, rsi4h=40+i/10,
                     rsi24h=50+i/10, rsi1w=None if i==10 else 60+i/10,
                     volume24h=1000000/i) for i in range(1,52)]

    def test_top50_does_not_change_for_missing_weekly_rsi(self):
        source=self.source()
        caps=[dict(symbol=f'C{i}',marketCap=i*100) for i in range(1,51)]
        rows=normalize_rows(list(reversed(source)), caps, '1w')
        self.assertEqual(len(rows),50)
        self.assertEqual(rows[0]['symbol'],'C1')
        self.assertNotIn('C51',{r['symbol'] for r in rows})
        missing=next(r for r in rows if r['symbol']=='C10')
        self.assertIsNone(missing['rsi'])
        self.assertEqual(missing['rsiValues']['4h'],41)
        self.assertEqual({r['sourceRank'] for r in rows},set(range(1,51)))

    def test_missing_cap_is_not_replaced_with_volume(self):
        rows=normalize_rows(self.source(),[dict(symbol='C50',marketCap=1)],'24h')
        self.assertEqual(rows[0]['symbol'],'C1')
        self.assertIsNone(rows[1]['marketCap'])
        self.assertEqual(rows[1]['weight'],0)
        self.assertEqual(rows[0]['rsi'],50.1)

    def test_incomplete_and_duplicate_top50_rejected(self):
        with self.assertRaises(RsiHeatmapError):normalize_rows(self.source()[1:],[],'4h')
        source=self.source();source[1]['symbol']='C1'
        with self.assertRaises(RsiHeatmapError):normalize_rows(source,[],'4h')

if __name__=='__main__':unittest.main()
