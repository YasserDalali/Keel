// Illustrative figures for the demo. Replace with real numbers before launch.
export const STATS = [
  { value: 12480, label: "Loans funded since 2023", format: (n: number) => Math.round(n).toLocaleString("en-US") },
  { value: 97.2, label: "Repaid on schedule", format: (n: number) => `${n.toFixed(1)}%` },
  { value: 2, label: "Business days to a decision, typically", format: (n: number) => `${Math.round(n)} days` },
];

export const BORROWERS = [
  { name: "Amina Diallo", business: "Tailor", city: "Dakar", amount: 2400, purpose: "a second sewing machine", img: "tile-sewing" },
  { name: "Kwame Mensah", business: "Motorbike repair", city: "Kumasi", amount: 1800, purpose: "a compressor and an engine stand", img: "tile-motorbike" },
  { name: "Leila Haddad", business: "Grocer", city: "Tunis", amount: 3500, purpose: "a bigger stock order before the holidays", img: "tile-grocer" },
  { name: "Thandiwe Nkosi", business: "Potter", city: "Durban", amount: 1200, purpose: "an electric wheel", img: "tile-pottery" },
  { name: "Rafael Ortiz", business: "Baker", city: "Oaxaca", amount: 6500, purpose: "a second deck oven", img: "tile-bakery" },
  { name: "Siti Rahma", business: "Produce seller", city: "Surabaya", amount: 800, purpose: "crates and a stall licence", img: "tile-produce" },
  { name: "Nguyen Van An", business: "Street food", city: "Hanoi", amount: 950, purpose: "a new cart", img: "tile-cart" },
];

export const TESTIMONIAL = {
  quote:
    "I used to turn down big orders because I couldn't buy the timber up front. With the loan I bought it, delivered twelve wardrobes, and paid Keel back a month early.",
  name: "Joseph Okello",
  business: "Carpenter",
  city: "Kampala",
  amount: 3000,
};

/** Featured borrower story shown beside the tailor in "Who borrows". */
export const FEATURED = {
  quote: "The second machine paid for itself before my fifth payment.",
  term: 12,
  paid: 9,
};
