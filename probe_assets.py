import sys
print('probe start')
try:
    import custom_bitmaps as c
    print('import ok')
    print('FONT_UI_BIG', len(c.FONT_UI_BIG))
    print('FONT_TIME', len(c.FONT_TIME))
    print('FONT_DATE', len(c.FONT_DATE))
    print('FONT_JP', len(c.FONT_JP))
except Exception as e:
    print('import error', type(e).__name__, e)
