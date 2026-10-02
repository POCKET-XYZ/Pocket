/**
 * Tiny but real Office files for tests, built with a minimal ZIP writer: no
 * dependency, entries stored uncompressed unless asked otherwise. Only for
 * specs; the build leaves this folder out.
 */
import { deflateRawSync } from 'node:zlib';

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(data: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of data) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

/** A ZIP of the given entries. `deflate` compresses them the way Office does. */
export function zip(entries: Record<string, string>, deflate = false): Buffer {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;
  for (const [name, content] of Object.entries(entries)) {
    const nameBytes = Buffer.from(name, 'utf8');
    const raw = Buffer.from(content, 'utf8');
    const data = deflate ? deflateRawSync(raw) : raw;
    const crc = crc32(raw);

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0, 6);
    local.writeUInt16LE(deflate ? 8 : 0, 8);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(raw.length, 22);
    local.writeUInt16LE(nameBytes.length, 26);
    locals.push(local, nameBytes, data);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0, 8);
    central.writeUInt16LE(deflate ? 8 : 0, 10);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(data.length, 20);
    central.writeUInt32LE(raw.length, 24);
    central.writeUInt16LE(nameBytes.length, 28);
    central.writeUInt32LE(offset, 42);
    centrals.push(central, nameBytes);

    offset += local.length + nameBytes.length + data.length;
  }
  const directory = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(Object.keys(entries).length, 8);
  end.writeUInt16LE(Object.keys(entries).length, 10);
  end.writeUInt32LE(directory.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, directory, end]);
}

function contentTypes(main: string): string {
  return (
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
    '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
    '<Default Extension="xml" ContentType="application/xml"/>' +
    main +
    '</Types>'
  );
}

const RELS =
  '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
  '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"/>';

/** A minimal workbook with one sheet, as Excel saves an .xlsx. */
export function xlsx(deflate = false): Buffer {
  return zip(
    {
      '[Content_Types].xml': contentTypes(
        '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
          '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>',
      ),
      '_rels/.rels': RELS,
      'xl/workbook.xml':
        '<workbook><sheets><sheet name="KPIs" sheetId="1"/></sheets></workbook>',
      'xl/worksheets/sheet1.xml': '<worksheet><sheetData/></worksheet>',
    },
    deflate,
  );
}

/** A minimal document, as Word saves a .docx. */
export function docx(deflate = false): Buffer {
  return zip(
    {
      '[Content_Types].xml': contentTypes(
        '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>',
      ),
      '_rels/.rels': RELS,
      'word/document.xml': '<w:document><w:body><w:p/></w:body></w:document>',
    },
    deflate,
  );
}

/** A macro-enabled workbook (.xlsm), as Excel saves one. */
export function xlsm(): Buffer {
  return zip({
    '[Content_Types].xml': contentTypes(
      '<Default Extension="bin" ContentType="application/vnd.ms-office.vbaProject"/>' +
        '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.ms-excel.sheet.macroEnabled.main+xml"/>',
    ),
    '_rels/.rels': RELS,
    'xl/workbook.xml': '<workbook/>',
    'xl/vbaProject.bin': 'Attribute VB_Name = "Module1"',
  });
}

/** A macro-enabled document (.docm), as Word saves one. */
export function docm(): Buffer {
  return zip({
    '[Content_Types].xml': contentTypes(
      '<Override PartName="/word/document.xml" ContentType="application/vnd.ms-word.document.macroEnabled.main+xml"/>',
    ),
    '_rels/.rels': RELS,
    'word/document.xml': '<w:document/>',
    'word/vbaProject.bin': 'Attribute VB_Name = "NewMacros"',
  });
}
