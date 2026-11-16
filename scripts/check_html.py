from html.parser import HTMLParser
from pathlib import Path
import xml.etree.ElementTree as ET

class Page(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.ids, self.refs, self.labels, self.inputs = set(), [], set(), []
        self.stack = []
    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        if 'id' in a:
            assert a['id'] not in self.ids, 'Duplicate id: ' + a['id']
            self.ids.add(a['id'])
        for key in ['aria-labelledby', 'aria-controls']:
            self.refs.extend(a.get(key, '').split())
        if tag == 'label':
            if 'for' in a: self.labels.add(a['for'])
        if tag == 'input':
            self.inputs.append((a, 'label' in self.stack))
        if tag not in ['area','base','br','col','embed','hr','img','input','link','meta','param','source','track','wbr']:
            self.stack.append(tag)
    def handle_endtag(self, tag):
        assert self.stack and self.stack[-1] == tag, 'Unbalanced HTML: ' + tag
        self.stack.pop()

p = Page()
p.feed(Path('index.html').read_text())
assert not p.stack, 'Unclosed elements'
assert all(x in p.ids for x in p.refs), 'Broken accessibility reference'
for attrs, wrapped in p.inputs:
    assert wrapped or attrs.get('id') in p.labels or attrs.get('aria-label'), 'Input without an accessible label'
for path in Path('assets').glob('*.svg'):
    ET.parse(path)
print('HTML structure, input labels and SVG XML passed.')
