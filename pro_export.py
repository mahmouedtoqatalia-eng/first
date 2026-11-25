"""Professional XLSX export for EGYPT GAS."""
from datetime import datetime
from openpyxl import Workbook, load_workbook
from openpyxl.styles import Font, PatternFill, Border, Side, Alignment
from openpyxl.utils import get_column_letter
from openpyxl.worksheet.page import PageMargins

def write_excel(path,title,headers,rows):
    headers=[str(x) for x in headers]; rows=list(rows); n=max(1,len(headers))
    wb=Workbook(); ws=wb.active; ws.title="EGYPT GAS"; ws.sheet_view.rightToLeft=True; ws.sheet_view.showGridLines=False
    for r,value,bg,fg,size in [(1,"EGYPT GAS  |  منظومة إدارة المخازن والعدادات","123D59","FFFFFF",17),(2,str(title),"EAF3F7","123D59",15),(3,"تاريخ التصدير: "+datetime.now().strftime("%Y/%m/%d %H:%M")+"   |   عدد السجلات: "+str(len(rows)),"FFFFFF","60778B",10)]:
        if n>1: ws.merge_cells(start_row=r,start_column=1,end_row=r,end_column=n)
        c=ws.cell(r,1,value);c.fill=PatternFill("solid",fgColor=bg);c.font=Font(name="Arial",size=size,bold=r!=3,color=fg);c.alignment=Alignment(horizontal="center",vertical="center")
    for r,h in [(1,43),(2,36),(3,27),(4,13),(5,33)]: ws.row_dimensions[r].height=h
    widths=[max(16,min(48,len(h)+7)) for h in headers]
    for ci,h in enumerate(headers,1):
        c=ws.cell(5,ci,h);c.fill=PatternFill("solid",fgColor="087F8C");c.font=Font(name="Arial",bold=True,color="FFFFFF",size=11);c.alignment=Alignment(horizontal="center",vertical="center",wrap_text=True)
    for ri,record in enumerate(rows,6):
        ws.row_dimensions[ri].height=24
        for ci in range(1,n+1):
            v=record[ci-1] if ci<=len(record) else None
            if isinstance(v,bytes):v=v.decode("utf-8","replace")
            c=ws.cell(ri,ci,v)
            if isinstance(v,str):c.data_type="s"
            c.font=Font(name="Arial",size=10,color="23384A");c.fill=PatternFill("solid",fgColor="FFFFFF" if ri%2 else "EAF3F7");c.alignment=Alignment(horizontal="center",vertical="center");c.border=Border(bottom=Side(style="hair",color="D8E3EA"))
            if isinstance(v,(int,float)) and not isinstance(v,bool):c.number_format='#,##0.##'
            if ci<=len(widths):widths[ci-1]=max(widths[ci-1],min(48,len(str(v or ""))+4))
    for ci,w in enumerate(widths,1):ws.column_dimensions[get_column_letter(ci)].width=w
    ws.freeze_panes="A6";ws.auto_filter.ref=f"A5:{get_column_letter(n)}{max(5,len(rows)+5)}";ws.print_title_rows="1:5"
    ws.page_setup.orientation="landscape";ws.page_setup.paperSize=ws.PAPERSIZE_A4;ws.sheet_properties.pageSetUpPr.fitToPage=True;ws.page_setup.fitToWidth=1;ws.page_setup.fitToHeight=0
    ws.page_margins=PageMargins(left=.25,right=.25,top=.6,bottom=.6,header=.2,footer=.2)
    ws.oddFooter.center.text="EGYPT GAS | Page &P / &N"
    wb.save(path)
    check=load_workbook(path,read_only=True,data_only=True)
    try:
        if headers and check.active.cell(5,1).value!=headers[0]:raise ValueError("Failed to verify exported headers")
        if rows and check.active.cell(6,1).value!=rows[0][0]:raise ValueError("Failed to verify exported rows")
    finally:check.close()
