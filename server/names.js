const VISUAL = {
  а: 'a', в: 'b', е: 'e', ё: 'e', к: 'k', м: 'm', н: 'h', о: 'o', р: 'p', с: 'c', т: 't', у: 'y', х: 'x', і: 'i', ї: 'i', з: '3', ч: '4', б: '6', и: 'u', п: 'n', г: 'r', д: 'd', л: 'l', й: 'u', ь: 'b', ы: 'bi', я: 'r', ж: 'x', ш: 'w', щ: 'w', ц: 'u', ф: 'f', э: 'e', ю: 'io', ъ: 'b',
};
const PHONETIC = {
  а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e', ж: 'zh', з: 'z', и: 'i', й: 'i', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'h', ц: 'c', ч: 'ch', ш: 'sh', щ: 'sh', ъ: '', ы: 'y', ь: '', э: 'e', ю: 'yu', я: 'ya', і: 'i', ї: 'i', є: 'e', ґ: 'g',
};
const LEET = { 0: 'o', 1: 'i', 3: 'e', 4: 'a', 5: 's', 6: 'b', 7: 't', 8: 'b', 9: 'g', '@': 'a', $: 's', '!': 'i', '|': 'i', '€': 'e' };

const ROOTS = [
  'niger', 'niga', 'nigr', 'negr', 'nygg', 'kike', 'fagot', 'fagit', 'chink', 'wetback',
  'pidor', 'pidar', 'pidr', 'pedik', 'gomik', 'huy', 'hui', 'huj', 'xuy', 'xui', 'xyu', 'xyi', 'hyi', 'pizd', 'pisd', 'pi3d',
  'ebal', 'eban', 'ebat', 'ebla', 'ebut', 'ebyc', 'yeba', 'ieba', 'blyat', 'blyad', 'bliad', 'blat', 'suka', 'cyka', 'syka', 'mudak', 'mudil', 'zalup',
  'gandon', 'shluh', 'shlyuh', 'wluh', 'hohol', 'xoxol', 'moskal', 'churk', 'chyrk', 'zhid', 'zhyd',
  'fuck', 'fuk', 'shit', 'cunt', 'whore', 'retard', 'hitler', 'nahui', 'nahuy',
];
const RAW_BAD = [/1488/, /14\s*88/, /kkk/i, /sieg\s*heil/i, /\bnazi\b/i, /卐|卍/];

function skeletons(s) {
  const low = s.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '');
  const out = [];
  for (const map of [VISUAL, PHONETIC]) {
    let t = '';
    for (const ch of low) {
      if (map[ch] != null) t += map[ch];
      else if (LEET[ch] != null) t += LEET[ch];
      else if (/[a-z]/.test(ch)) t += ch;
    }
    out.push(t.replace(/(.)\1+/g, '$1'));
    out.push(t.replace(/(.)\1+/g, '$1').replace(/x/g, 'h').replace(/y/g, 'u').replace(/j/g, 'i'));
  }
  return out;
}

const ROOTS_SKEL = [...new Set(ROOTS.flatMap((r) => [r.replace(/(.)\1+/g, '$1'), r.replace(/(.)\1+/g, '$1').replace(/x/g, 'h').replace(/y/g, 'u').replace(/j/g, 'i')]))];

export function isBad(s) {
  if (!s) return false;
  if (RAW_BAD.some((re) => re.test(s))) return true;
  return skeletons(s).some((t) => ROOTS_SKEL.some((r) => t.includes(r)));
}

export function cleanName(name, id) {
  const clean = String(typeof name === 'string' ? name : '').normalize('NFKC').replace(/[^\p{L}\p{N} _.\-]/gu, '').replace(/\s+/g, ' ').trim().slice(0, 16);
  if (!clean || isBad(clean)) return `Player${id}`;
  return clean;
}

export function cleanChat(text) {
  if (!isBad(text)) return text;
  return text.split(/(\s+)/).map((w) => (/\s/.test(w) || !isBad(w) ? w : '***')).join('');
}
