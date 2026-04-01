import gc
print('mem probe start')
gc.collect()
print('free_before', gc.mem_free())
print('alloc_before', gc.mem_alloc())
try:
    import custom_bitmaps as c
    gc.collect()
    print('import_ok', len(c.FONT_UI_BIG), len(c.FONT_TIME), len(c.FONT_DATE), len(c.FONT_JP))
    print('free_after', gc.mem_free())
    print('alloc_after', gc.mem_alloc())
except Exception as e:
    print('import_error', type(e).__name__, e)
