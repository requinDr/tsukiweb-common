import opencc

cc = opencc.OpenCC('s2twp.json')

with open('fullscript_zh-yueji_yeren_hanhua_zu.txt', 'r', encoding='utf-8') as fin, \
	open('fullscript_zh-tw-yueji_yeren_hanhua_zu.txt', 'w', encoding='utf-8') as fout:

	for line in fin:
	  fout.write(cc.convert(line))