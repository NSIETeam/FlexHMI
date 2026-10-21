import unittest, tempfile, json
from pathlib import Path
from payload_policy import include_source, prune_development

class PayloadPolicy(unittest.TestCase):
    def test_keeps_shared_production_package_and_licenses(self):
        with tempfile.TemporaryDirectory() as temp:
            root=Path(temp); source=root/'source'; source.mkdir(); staged=root/'staged/node_modules'
            lock=source/'package-lock.json'; lock.write_text(json.dumps({'lockfileVersion':3,'packages':{'node_modules/mocha':{'dev':True},'node_modules/typescript':{},'node_modules/parent/node_modules/tool':{'dev':True}}}))
            for name in ['mocha','typescript','parent/node_modules/tool']:
                d=staged/name; d.mkdir(parents=True); (d/'LICENSE').write_text('preserved license'); (d/'index.js').write_text('module.exports=1')
            result=prune_development(staged,lock)
            self.assertFalse((staged/'mocha').exists()); self.assertFalse((staged/'parent/node_modules/tool').exists())
            self.assertEqual((staged/'typescript/LICENSE').read_text(),'preserved license'); self.assertEqual(len(result['removedPackages']),2)
            with self.assertRaises(ValueError):prune_development(source/'node_modules',lock)
    def test_rejects_escaping_lock_path_before_mutation(self):
        with tempfile.TemporaryDirectory() as temp:
            root=Path(temp); lock=root/'package-lock.json'; lock.write_text(json.dumps({'lockfileVersion':3,'packages':{'node_modules/../../keep':{'dev':True}}}))
            with self.assertRaises(ValueError):prune_development(root/'staged/node_modules',lock)
    def test_ships_desktop_guide_and_runtime_not_evidence_or_mcp_tests(self):
        self.assertTrue(include_source('docs/simplehmi/DESKTOP.md'))
        for name in ['docs/simplehmi/ai/channel-verification/after.png','docs/simplehmi/ai/GOAL.md','integrations/mcp/test/adapter.test.mjs']:self.assertFalse(include_source(name))
        for name in ['server/main.js','integrations/mcp/server.mjs','simplehmi/alarm-state.mjs']:self.assertTrue(include_source(name))
if __name__=='__main__':unittest.main()
