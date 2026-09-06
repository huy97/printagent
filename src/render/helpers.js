import Handlebars from 'handlebars';
import QRCode from 'qrcode';

const numberFormatCache = new Map();

function formatter(locale, options) {
  const key = `${locale}:${JSON.stringify(options)}`;
  if (!numberFormatCache.has(key)) {
    numberFormatCache.set(key, new Intl.NumberFormat(locale, options));
  }
  return numberFormatCache.get(key);
}

function qrSvg(text, { size = 120, margin = 1, ecl = 'M' } = {}) {
  const value = String(text ?? '');
  if (value === '') return '';
  const qr = QRCode.create(value, { errorCorrectionLevel: ecl });
  const count = qr.modules.size;
  const data = qr.modules.data;
  const total = count + margin * 2;
  let path = '';
  for (let row = 0; row < count; row += 1) {
    for (let col = 0; col < count; col += 1) {
      if (data[row * count + col]) {
        path += `M${col + margin} ${row + margin}h1v1h-1z`;
      }
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${total} ${total}" shape-rendering="crispEdges"><rect width="${total}" height="${total}" fill="#fff"/><path d="${path}" fill="#000"/></svg>`;
}

const ASCII_PUNCTUATION = { '\u2013': '-', '\u2014': '-', '\u2018': "'", '\u2019': "'", '\u201c': '"', '\u201d': '"', '\u2026': '...' };

// Máy in nhiệt ở chế độ raw thường chỉ hiểu ASCII: bỏ dấu trước khi gửi.
export function removeDiacritics(value) {
  return String(value ?? '')
    .replace(/[\u2013\u2014\u2018\u2019\u201c\u201d\u2026]/g, (char) => ASCII_PUNCTUATION[char])
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .replace(/[^\x20-\x7e\n\r\t]/g, '');
}

const DIGITS = ['không', 'một', 'hai', 'ba', 'bốn', 'năm', 'sáu', 'bảy', 'tám', 'chín'];
const SCALES = ['', ' nghìn', ' triệu', ' tỷ', ' nghìn tỷ', ' triệu tỷ', ' tỷ tỷ'];

function readTriple(value, full) {
  const hundred = Math.floor(value / 100);
  const ten = Math.floor((value % 100) / 10);
  const unit = value % 10;
  const parts = [];
  if (full || hundred > 0) parts.push(`${DIGITS[hundred]} trăm`);
  if (ten === 0) {
    if (unit > 0 && parts.length > 0) parts.push('linh');
    if (unit > 0) parts.push(DIGITS[unit]);
  } else if (ten === 1) {
    parts.push('mười');
    if (unit === 5) parts.push('lăm');
    else if (unit > 0) parts.push(DIGITS[unit]);
  } else {
    parts.push(`${DIGITS[ten]} mươi`);
    if (unit === 1) parts.push('mốt');
    else if (unit === 4) parts.push('tư');
    else if (unit === 5) parts.push('lăm');
    else if (unit > 0) parts.push(DIGITS[unit]);
  }
  return parts.join(' ');
}

export function numberToVietnameseWords(value) {
  const number = Math.round(Number(value));
  if (!Number.isFinite(number)) return '';
  if (number === 0) return 'Không';
  const groups = [];
  let rest = Math.abs(number);
  while (rest > 0) {
    groups.unshift(rest % 1000);
    rest = Math.floor(rest / 1000);
  }
  const words = groups
    .map((group, index) => {
      const scale = SCALES[groups.length - 1 - index] ?? '';
      if (group === 0) return '';
      return `${readTriple(group, index > 0)}${scale}`;
    })
    .filter(Boolean)
    .join(' ');
  const text = `${number < 0 ? 'âm ' : ''}${words}`;
  return text.charAt(0).toUpperCase() + text.slice(1);
}

const EN_UNITS = [
  'zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten',
  'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen',
];
const EN_TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];
const EN_SCALES = ['', ' thousand', ' million', ' billion', ' trillion'];

/** Tên đơn vị tiền để đọc thành chữ: [số ít, số nhiều, đơn vị lẻ số ít, đơn vị lẻ số nhiều]. */
const CURRENCY_WORDS = {
  USD: ['US dollar', 'US dollars', 'cent', 'cents'],
  EUR: ['euro', 'euros', 'cent', 'cents'],
  GBP: ['pound sterling', 'pounds sterling', 'penny', 'pence'],
  AUD: ['Australian dollar', 'Australian dollars', 'cent', 'cents'],
  CAD: ['Canadian dollar', 'Canadian dollars', 'cent', 'cents'],
  SGD: ['Singapore dollar', 'Singapore dollars', 'cent', 'cents'],
  JPY: ['yen', 'yen', 'sen', 'sen'],
  VND: ['Vietnamese dong', 'Vietnamese dong', 'xu', 'xu'],
};

function readEnglishTriple(value) {
  const hundred = Math.floor(value / 100);
  const rest = value % 100;
  const parts = [];
  if (hundred > 0) parts.push(`${EN_UNITS[hundred]} hundred`);
  if (rest > 0) {
    if (parts.length > 0) parts.push('and');
    if (rest < 20) parts.push(EN_UNITS[rest]);
    else {
      const ten = Math.floor(rest / 10);
      const unit = rest % 10;
      parts.push(unit > 0 ? `${EN_TENS[ten]}-${EN_UNITS[unit]}` : EN_TENS[ten]);
    }
  }
  return parts.join(' ');
}

export function numberToEnglishWords(value) {
  const number = Math.trunc(Number(value));
  if (!Number.isFinite(number)) return '';
  if (number === 0) return 'Zero';
  const groups = [];
  let rest = Math.abs(number);
  while (rest > 0) {
    groups.unshift(rest % 1000);
    rest = Math.floor(rest / 1000);
  }
  const words = groups
    .map((group, index) => {
      if (group === 0) return '';
      return `${readEnglishTriple(group)}${EN_SCALES[groups.length - 1 - index] ?? ''}`;
    })
    .filter(Boolean)
    .join(' ');
  const text = `${number < 0 ? 'minus ' : ''}${words}`;
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/**
 * Đọc số tiền thành chữ kèm tên đơn vị, dùng cho ô "bằng chữ" trên hoá đơn.
 * Phần lẻ chỉ đọc với đơn vị tiền có chia nhỏ (USD, EUR...), không áp cho VND.
 */
export function amountToEnglishWords(value, currency = 'USD') {
  const number = Number(value);
  if (!Number.isFinite(number)) return '';
  const code = String(currency ?? 'USD').toUpperCase();
  const [singular, plural, fractionSingular, fractionPlural] = CURRENCY_WORDS[code] ?? [code, code, '', ''];
  const whole = Math.trunc(Math.abs(number));
  const fraction = fractionPlural ? Math.round((Math.abs(number) - whole) * 100) : 0;
  const parts = [`${numberToEnglishWords(whole)} ${whole === 1 ? singular : plural}`];
  if (fraction > 0) {
    parts.push(`and ${numberToEnglishWords(fraction).toLowerCase()} ${fraction === 1 ? fractionSingular : fractionPlural}`);
  }
  const text = `${number < 0 ? 'minus ' : ''}${parts.join(' ')} only`;
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export function registerHelpers(handlebars = Handlebars) {
  handlebars.registerHelper('formatNumber', (value, options) => {
    const digits = options?.hash?.digits ?? 0;
    const locale = options?.hash?.locale ?? 'vi-VN';
    const number = Number(value);
    if (!Number.isFinite(number)) return '';
    return formatter(locale, { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(number);
  });

  handlebars.registerHelper('currency', (value, options) => {
    const currency = options?.hash?.currency ?? 'VND';
    const locale = options?.hash?.locale ?? 'vi-VN';
    const number = Number(value);
    if (!Number.isFinite(number)) return '';
    return formatter(locale, {
      style: 'currency',
      currency,
      maximumFractionDigits: currency === 'VND' ? 0 : 2,
    }).format(number);
  });

  handlebars.registerHelper('formatDate', (value, options) => {
    const hash = options?.hash ?? {};
    const locale = hash.locale ?? 'vi-VN';
    const date = value ? new Date(value) : new Date();
    if (Number.isNaN(date.getTime())) return '';
    const parts = ['weekday', 'year', 'month', 'day', 'hour', 'minute', 'second'].filter((key) => hash[key]);
    if (parts.length > 0) {
      return new Intl.DateTimeFormat(
        locale,
        Object.fromEntries([...parts.map((key) => [key, hash[key]]), ['timeZone', hash.timeZone]]),
      ).format(date);
    }
    return new Intl.DateTimeFormat(locale, {
      dateStyle: hash.dateStyle ?? 'short',
      timeStyle: hash.timeStyle,
      timeZone: hash.timeZone,
    }).format(date);
  });

  handlebars.registerHelper('now', (options) => {
    const locale = options?.hash?.locale ?? 'vi-VN';
    return new Intl.DateTimeFormat(locale, { dateStyle: 'short', timeStyle: 'short' }).format(new Date());
  });

  handlebars.registerHelper('add', (a, b) => Number(a) + Number(b));
  handlebars.registerHelper('sub', (a, b) => Number(a) - Number(b));
  handlebars.registerHelper('mul', (a, b) => Number(a) * Number(b));
  handlebars.registerHelper('div', (a, b) => (Number(b) === 0 ? 0 : Number(a) / Number(b)));
  handlebars.registerHelper('inc', (value) => Number(value) + 1);

  handlebars.registerHelper('sum', (items, field) => {
    if (!Array.isArray(items)) return 0;
    return items.reduce((total, item) => total + (Number(field ? item?.[field] : item) || 0), 0);
  });

  handlebars.registerHelper('eq', (a, b) => a === b);
  handlebars.registerHelper('ne', (a, b) => a !== b);
  handlebars.registerHelper('gt', (a, b) => Number(a) > Number(b));
  handlebars.registerHelper('lt', (a, b) => Number(a) < Number(b));
  handlebars.registerHelper('and', (...args) => args.slice(0, -1).every(Boolean));
  handlebars.registerHelper('or', (...args) => args.slice(0, -1).some(Boolean));

  handlebars.registerHelper('upper', (value) => String(value ?? '').toUpperCase());
  handlebars.registerHelper('lower', (value) => String(value ?? '').toLowerCase());
  handlebars.registerHelper('padStart', (value, length, char) =>
    String(value ?? '').padStart(Number(length) || 0, typeof char === 'string' ? char : ' '),
  );
  handlebars.registerHelper('padEnd', (value, length, char) =>
    String(value ?? '').padEnd(Number(length) || 0, typeof char === 'string' ? char : ' '),
  );
  handlebars.registerHelper('repeat', (char, length) => String(char ?? '').repeat(Number(length) || 0));
  handlebars.registerHelper('concat', (...args) => args.slice(0, -1).map((value) => String(value ?? '')).join(''));
  handlebars.registerHelper('ascii', (value) => removeDiacritics(value));
  // Bill máy in nhiệt chỉ có một số cột cố định: nhãn bám trái, số bám phải.
  handlebars.registerHelper('cols', (left, right, width) => {
    const size = Number(width) || 32;
    const tail = String(right ?? '');
    const head = String(left ?? '');
    const room = size - tail.length - 1;
    if (room < 1) return `${head} ${tail}`.trim();
    return `${head.length > room ? head.slice(0, room) : head.padEnd(room, ' ')} ${tail}`;
  });
  handlebars.registerHelper('json', (value) => JSON.stringify(value, null, 2));
  handlebars.registerHelper('vndWords', (value) => numberToVietnameseWords(value));

  handlebars.registerHelper('enWords', (value, options) =>
    amountToEnglishWords(value, options?.hash?.currency ?? 'USD'),
  );

  handlebars.registerHelper('amountWords', (value, options) => {
    const locale = String(options?.hash?.locale ?? 'vi').toLowerCase();
    if (locale.startsWith('en')) return amountToEnglishWords(value, options?.hash?.currency ?? 'USD');
    return numberToVietnameseWords(value);
  });

  handlebars.registerHelper('qr', (value, options) => {
    const svg = qrSvg(value, {
      size: options?.hash?.size ?? 120,
      margin: options?.hash?.margin ?? 1,
      ecl: options?.hash?.ecl ?? 'M',
    });
    return new handlebars.SafeString(svg);
  });

  handlebars.registerHelper('qrDataUri', (value, options) => {
    const svg = qrSvg(value, { size: options?.hash?.size ?? 120 });
    if (!svg) return '';
    return `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
  });

  return handlebars;
}

export function createHandlebars() {
  const instance = Handlebars.create();
  registerHelpers(instance);
  return instance;
}
