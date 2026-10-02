import { docm, docx, xlsm, xlsx, zip } from '../../testing/office-files';
import {
  DOCX_TYPE,
  XLSX_TYPE,
  isCsv,
  safeFileName,
  sniffAttachment,
  sniffReportFile,
} from './file-type';
import { privateFileHeaders } from './send-file';

const PDF = Buffer.from('%PDF-1.7\n1 0 obj << /Type /Catalog >> endobj\n%%EOF');
const CSV = Buffer.from(
  'KPI,Target,Result\r\nQualified leads,50,48\r\nReply rate,8%,9%\r\n',
);
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);
const EXE = Buffer.concat([
  Buffer.from('MZ'),
  Buffer.from([0x90, 0, 3, 0, 0, 0, 4, 0, 0, 0, 0xff, 0xff, 0, 0]),
  Buffer.from('This program cannot be run in DOS mode.'),
]);
const SVG = Buffer.from(
  '<?xml version="1.0"?><svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>',
);

describe('sniffReportFile', () => {
  it.each([
    ['a PDF', PDF, 'application/pdf'],
    ['an .xlsx', xlsx(), XLSX_TYPE],
    ['an .xlsx with its entries deflated, as Excel saves it', xlsx(true), XLSX_TYPE],
    ['a .docx', docx(), DOCX_TYPE],
    ['a .docx with its entries deflated, as Word saves it', docx(true), DOCX_TYPE],
    ['a CSV', CSV, 'text/csv'],
    [
      'a CSV with a byte order mark and accents',
      Buffer.from('\uFEFFMétrica;Año\n1;2\n'),
      'text/csv',
    ],
  ])('accepts %s', (_label, bytes, type) => {
    expect(sniffReportFile(bytes)).toBe(type);
  });

  it.each([
    ['a macro-enabled workbook (.xlsm)', xlsm()],
    ['a macro-enabled document (.docm)', docm()],
    [
      'a workbook that says it has macros, without the macro file',
      zip({
        '[Content_Types].xml':
          '<Types><Override PartName="/xl/workbook.xml" ContentType="application/vnd.ms-excel.sheet.macroEnabled.main+xml"/></Types>',
        'xl/workbook.xml': '<workbook/>',
      }),
    ],
    [
      'a workbook carrying a macro project it does not declare',
      zip({
        '[Content_Types].xml':
          '<Types><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/></Types>',
        'xl/workbook.xml': '<workbook/>',
        'xl/vbaProject.bin': 'macros',
      }),
    ],
    ['a ZIP without a list of content types', zip({ 'xl/workbook.xml': '<workbook/>' })],
    [
      'a ZIP with content types but no workbook or document',
      zip({ '[Content_Types].xml': '<Types/>', 'notes.txt': 'hello' }),
    ],
    [
      'a presentation (.pptx)',
      zip({
        '[Content_Types].xml':
          '<Types><Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/></Types>',
        'ppt/presentation.xml': '<p:presentation/>',
      }),
    ],
    ['a ZIP cut short', xlsx().subarray(0, 200)],
    ['a ZIP header and nothing else', Buffer.from('PK\u0003\u0004 archive')],
    ['a renamed .exe', EXE],
    ['an SVG', SVG],
    ['a web page', Buffer.from('  <!doctype html><html><body>report</body></html>')],
    [
      'binary junk named .csv',
      Buffer.from([0x4b, 0x50, 0x49, 0x2c, 0x00, 0x01, 0x02, 0x41]),
    ],
    ['text that is not UTF-8', Buffer.from([0x4b, 0x50, 0x49, 0x2c, 0xe9, 0x0a])],
    ['text with control bytes', Buffer.from('KPI,Result\n\u0007bell,1\n')],
    ['an image', PNG],
    ['an empty file', Buffer.alloc(0)],
    ['a file of only spaces', Buffer.from('   \n  ')],
  ])('refuses %s', (_label, bytes) => {
    expect(sniffReportFile(bytes)).toBeNull();
  });
});

describe('sniffAttachment', () => {
  it.each([
    ['a PDF', PDF, 'application/pdf'],
    ['a PNG', PNG, 'image/png'],
    ['an .xlsx', xlsx(true), XLSX_TYPE],
    ['a .docx', docx(true), DOCX_TYPE],
    ['a CSV', CSV, 'text/csv'],
  ])('accepts %s', (_label, bytes, type) => {
    expect(sniffAttachment(bytes)).toBe(type);
  });

  it.each([
    ['an .xlsm', xlsm()],
    ['a .docm', docm()],
    ['a renamed .exe', EXE],
    ['an SVG', SVG],
  ])('refuses %s', (_label, bytes) => {
    expect(sniffAttachment(bytes)).toBeNull();
  });
});

describe('isCsv', () => {
  it('takes tabs and both kinds of line break', () => {
    expect(isCsv(Buffer.from('a\tb\r\nc\td\n'))).toBe(true);
  });
});

describe('safeFileName', () => {
  it.each([
    ['Monthly report.xlsx', XLSX_TYPE, 'Monthly report.xlsx'],
    // The extension always comes from the bytes, never from the name.
    ['report.exe', 'application/pdf', 'report.pdf'],
    ['C:\\Users\\ana\\KPIs "Q4".csv', 'text/csv', 'KPIs _Q4.csv'],
    ['../../etc/passwd', 'text/csv', 'passwd.csv'],
    ['Año fiscal.docx', DOCX_TYPE, 'A_o fiscal.docx'],
    ['"\r\nSet-Cookie: x.pdf', 'application/pdf', 'Set-Cookie_ x.pdf'],
    ['', 'application/pdf', 'report-template.pdf'],
    [undefined, 'text/csv', 'report-template.csv'],
    ['....', 'text/csv', 'report-template.csv'],
  ] as const)('names %j as %j', (original, type, expected) => {
    expect(safeFileName(original, type, 'report-template')).toBe(expected);
  });

  it('keeps names short', () => {
    expect(safeFileName(`${'a'.repeat(300)}.pdf`, 'application/pdf', 'x')).toHaveLength(
      84,
    );
  });
});

describe('privateFileHeaders', () => {
  it.each([
    ['an Excel file', XLSX_TYPE, XLSX_TYPE],
    ['a Word file', DOCX_TYPE, DOCX_TYPE],
    ['a PDF', 'application/pdf', 'application/pdf'],
    ['a CSV', 'text/csv', 'text/csv; charset=utf-8'],
  ] as const)('always saves %s, never opens it', (_label, type, served) => {
    expect(
      privateFileHeaders({ data: Buffer.alloc(1), contentType: type, fileName: 'r.x' }),
    ).toEqual({
      'Content-Type': served,
      'Content-Disposition': 'attachment; filename="r.x"',
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': 'private, no-store',
      'Content-Security-Policy': "sandbox; default-src 'none'",
    });
  });

  it('shows an image inline', () => {
    expect(
      privateFileHeaders({ data: PNG, contentType: 'image/png', fileName: 'a.png' })[
        'Content-Disposition'
      ],
    ).toBe('inline; filename="a.png"');
  });
});
