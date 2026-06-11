Character portrait avatars
==========================

Drop the 8 portrait images you provided into THIS folder using these exact
filenames (PNG). The app maps them to characters automatically:

  avatar-1.png  ->  Priya  (female)
  avatar-2.png  ->  Meera  (female)
  avatar-3.png  ->  Sara   (female)
  avatar-4.png  ->  Nisha  (female)
  avatar-5.png  ->  Arjun  (male)
  avatar-6.png  ->  Ravi   (male)
  avatar-7.png  ->  Dev    (male)
  avatar-8.png  ->  Aadi   (male)

Notes
-----
- Images 1-4 are the female portraits, 5-8 are the male portraits.
- Square images work best (they are shown in a circular crop).
- If a file is missing, the app gracefully falls back to the built-in
  SVG face for that character, so nothing ever breaks.
- To change the mapping, edit the `image` field in src/lib/characters.jsx.
