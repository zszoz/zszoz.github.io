const enToAr = {
    'q': 'ض', 'w': 'ص', 'e': 'ث', 'r': 'ق', 't': 'ف',
    'y': 'غ', 'u': 'ع', 'i': 'ه', 'o': 'خ', 'p': 'ح',
    'a': 'ش', 's': 'س', 'd': 'ي', 'f': 'ب', 'g': 'ل',
    'h': 'ا', 'j': 'ت', 'k': 'ن', 'l': 'م',
    'z': 'ئ', 'x': 'ء', 'c': 'ؤ', 'v': 'ر', 'b': 'لا',
    'n': 'ى', 'm': 'ة',
    ',': 'و', '.': 'ز', '/': 'ظ',
    '[': 'ج', ']': 'د', ';': 'ك', "'": 'ط',
    'Q': 'ض', 'W': 'ص', 'E': 'ث', 'R': 'ق', 'T': 'ف',
    'Y': 'غ', 'U': 'ع', 'I': 'ه', 'O': 'خ', 'P': 'ح',
    'A': 'ش', 'S': 'س', 'D': 'ي', 'F': 'ب', 'G': 'ل',
    'H': 'ا', 'J': 'ت', 'K': 'ن', 'L': 'م',
    'Z': 'ئ', 'X': 'ء', 'C': 'ؤ', 'V': 'ر', 'B': 'لا',
    'N': 'ى', 'M': 'ة',
    '<': 'و', '>': 'ز', '?': 'ظ'
  };
  
  const arToEn = {};
  for (let key in enToAr) {
    if (!arToEn[enToAr[key]]) {
      arToEn[enToAr[key]] = key;
    }
  }
  
  function convertText() {
    const input = document.getElementById("inputText").value;
    const direction = document.getElementById("direction").value;
    let output = '';
  
    for (let char of input) {
      if (direction === 'en-to-ar') {
        output += enToAr[char] || char;
      } else {
        output += arToEn[char] || char;
      }
    }
  
    document.getElementById("outputText").value = output;
  }