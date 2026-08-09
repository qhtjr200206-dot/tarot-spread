// 라이더-웨이트 덱 78장 카드 목록. 관리자 리딩 입력 화면의 카드 선택 UI(그룹 select)에서 사용.
const TAROT_CARD_GROUPS = [
  {
    label: "메이저 아르카나",
    cards: [
      "The Fool", "The Magician", "The High Priestess", "The Empress", "The Emperor",
      "The Hierophant", "The Lovers", "The Chariot", "Strength", "The Hermit",
      "Wheel of Fortune", "Justice", "The Hanged Man", "Death", "Temperance",
      "The Devil", "The Tower", "The Star", "The Moon", "The Sun",
      "Judgement", "The World",
    ],
  },
  {
    label: "완드 (Wands)",
    cards: [
      "Ace of Wands", "Two of Wands", "Three of Wands", "Four of Wands", "Five of Wands",
      "Six of Wands", "Seven of Wands", "Eight of Wands", "Nine of Wands", "Ten of Wands",
      "Page of Wands", "Knight of Wands", "Queen of Wands", "King of Wands",
    ],
  },
  {
    label: "컵 (Cups)",
    cards: [
      "Ace of Cups", "Two of Cups", "Three of Cups", "Four of Cups", "Five of Cups",
      "Six of Cups", "Seven of Cups", "Eight of Cups", "Nine of Cups", "Ten of Cups",
      "Page of Cups", "Knight of Cups", "Queen of Cups", "King of Cups",
    ],
  },
  {
    label: "소드 (Swords)",
    cards: [
      "Ace of Swords", "Two of Swords", "Three of Swords", "Four of Swords", "Five of Swords",
      "Six of Swords", "Seven of Swords", "Eight of Swords", "Nine of Swords", "Ten of Swords",
      "Page of Swords", "Knight of Swords", "Queen of Swords", "King of Swords",
    ],
  },
  {
    label: "펜타클 (Pentacles)",
    cards: [
      "Ace of Pentacles", "Two of Pentacles", "Three of Pentacles", "Four of Pentacles", "Five of Pentacles",
      "Six of Pentacles", "Seven of Pentacles", "Eight of Pentacles", "Nine of Pentacles", "Ten of Pentacles",
      "Page of Pentacles", "Knight of Pentacles", "Queen of Pentacles", "King of Pentacles",
    ],
  },
];

const TAROT_CARDS = TAROT_CARD_GROUPS.flatMap((g) => g.cards);
