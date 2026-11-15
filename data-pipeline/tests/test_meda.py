"""Synthetic parser fixtures plus optional local real-data validation."""
import csv
import json
from pathlib import Path
import sys
import tempfile
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from meda_pipeline import parse_lmst, number, sample_file, build_meda, FIELDS


class MedaTests(unittest.TestCase):
    def test_lmst(self):
        self.assertEqual(parse_lmst("00301M23:59:59.657",301),("23:59",5))
        for text in ["00301M24:00:00", "00302M00:00:00", "13:00", "00301M01:60:00"]:
            with self.assertRaises(ValueError): parse_lmst(text,301)

    def test_missing_sentinel_nonfinite(self):
        for v in [None,""," ","999999999","999999999.0"]: self.assertIsNone(number(v))
        self.assertEqual(number("0"),0)
        for v in ["NaN","Infinity","broken"]:
            with self.assertRaises(ValueError): number(v)

    def fixture(self, directory, category, rows):
        path=directory/f"WE__0301___________DER_{category}__________________P01.csv"
        fields=list(dict.fromkeys(k for row in rows for k in row))
        with path.open('w',newline='',encoding='utf-8') as f:
            w=csv.DictWriter(f,fieldnames=fields);w.writeheader();w.writerows(rows)
        return path

    def test_field_selection_same_row_only_kelvin_and_uncertainty(self):
        with tempfile.TemporaryDirectory() as tmp:
            p=self.fixture(Path(tmp),'RHS',[
                dict(SCLK='1',LTST='0301 00:32:00',LMST='00301M00:00:01.1',LOCAL_RELATIVE_HUMIDITY='',HUMIDITY_LOCAL_TEMP='200',HUMIDITY_LOCAL_TEMP_UNCERTAINTY='.2'),
                dict(SCLK='2',LTST='0301 00:32:01',LMST='00301M00:00:02.1',LOCAL_RELATIVE_HUMIDITY='5',HUMIDITY_LOCAL_TEMP='201',HUMIDITY_LOCAL_TEMP_UNCERTAINTY='.3'),
                dict(SCLK='3',LTST='0301 00:32:02',LMST='00301M00:00:03.1',LOCAL_RELATIVE_HUMIDITY='99',HUMIDITY_LOCAL_TEMP='250')])
            _,obs,audit=sample_file(p)
            self.assertEqual(len(obs),2);self.assertEqual(obs[0]['localTime'],obs[1]['localTime'])
            self.assertEqual(obs[0]['sensorTempC'],-73.15);self.assertIsNone(obs[0]['relativeHumidityPct'])
            self.assertEqual(obs[1]['relativeHumidityPct'],5);self.assertIsNone(obs[1]['sensorTempC'])
            m=obs[0]['measurements']['sensorTempC'];self.assertEqual(m['unit'],'°C');self.assertEqual(m['uncertainty'],.2)
            self.assertIsNone(m['quality']);self.assertEqual(m['file'],p.name)
            self.assertEqual(sample_file(p)[1],obs);self.assertEqual(audit['rows'],3)

    def test_wind_flag_and_sentinel(self):
        with tempfile.TemporaryDirectory() as tmp:
            p=self.fixture(Path(tmp),'WS',[
                dict(SCLK='1',LTST='0301 00:32:00',LMST='00301M00:00:01',HORIZONTAL_WIND_SPEED='999999999',ROVER_STILL=''),
                dict(SCLK='2',LTST='0301 00:32:01',LMST='00301M00:00:02',HORIZONTAL_WIND_SPEED='2',ROVER_STILL='1')])
            _,obs,_=sample_file(p);self.assertEqual(len(obs),1)
            self.assertEqual(obs[0]['windSpeedMps'],2)
            self.assertIsNone(obs[0]['measurements']['windSpeedMps']['quality'])
            self.assertIsNone(obs[0]['measurements']['windSpeedMps']['uncertainty'])

    def test_real_output_shape_provenance_and_missing_sensors(self):
        base=Path(__file__).resolve().parents[1]
        root=base/'raw/NASA Space Apps Project/HavaKoşullarıVerileri'
        if not root.exists():self.skipTest('Local MEDA files not installed')
        payload,audit=build_meda(root)
        self.assertEqual([s['sol'] for s in payload['sols']],[301,310,320,420,426,431])
        for sol in payload['sols']:
            for obs in sol['observations']:
                for key in ['airTempC','opacity','earthDate']:self.assertIsNone(obs[key])
                self.assertFalse(obs['isSample']);self.assertEqual(obs['timeSystem'],'LMST')
                self.assertTrue(any(obs[k] is not None for k in FIELDS))
                for key in FIELDS:
                    self.assertEqual(key in obs['measurements'],obs[key] is not None)
                if sol['sol'] not in [301,310]:self.assertIsNone(obs['windSpeedMps'])
        self.assertEqual(json.loads(json.dumps(payload,allow_nan=False)),payload)
        for a in audit:
            for selected in a['selections']:
                self.assertGreaterEqual(selected['line'],2)

    def test_selected_values_match_exact_source_rows(self):
        from meda_pipeline import SPECS
        base=Path(__file__).resolve().parents[1]
        root=base/'raw/NASA Space Apps Project/HavaKoşullarıVerileri'
        if not root.exists():self.skipTest('Local MEDA files not installed')
        _,audit=build_meda(root)
        paths={p.name:p for p in root.rglob('*.csv')}
        for entry in audit:
            selected={}
            for item in entry['selections']:selected.setdefault(item['line'],[]).append(item)
            with paths[entry['file']].open(encoding='utf-8-sig',newline='') as f:
                for line,row in enumerate(csv.DictReader(f),2):
                    for item in selected.get(line,[]):
                        provenance=item['provenance']
                        value=number(row[provenance['column']])
                        if item['field']=='sensorTempC':value=round(value-273.15,6)
                        self.assertEqual(item['value'],value)
                        self.assertEqual(item['lmst'],row['LMST'])
                        self.assertIsNone(provenance['quality'])
                        expected_unit=next(unit for field,_,unit,_ in SPECS[entry['category']] if field==item['field'])
                        self.assertEqual(provenance['unit'],expected_unit)
