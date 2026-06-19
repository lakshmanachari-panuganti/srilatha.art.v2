export const CONTACT = {
  whatsappE164: '919052380325',
  whatsappDisplay: '+91 90523 80325',
  phoneDisplay: '+91 90523 80325',
  email: 'studio@srilatha.art',
  studioAddress: {
    line1: 'Chilkanagar',
    line2: 'Uppal',
    city: 'Hyderabad',
    country: 'India',
  },
  instagramHandle: 'srilatha.art',
  instagramUrl: 'https://instagram.com/srilatha.art',
  hours: 'Mon–Sat · 10am–7pm IST',
} as const;

export const waLink = (text: string) =>
  `https://wa.me/${CONTACT.whatsappE164}?text=${encodeURIComponent(text)}`;
