32 / 40 / 56, always a full circle, brand tint behind initials when there is no photo.

```jsx
<Avatar name="Ahmed Hüsrev" />
<Avatar name="Zeynep Kübra" size="lg" src={photo} />
<AvatarStack people={talebeler} max={3} />
```

- `initials()` upper-cases with the `tr-TR` locale on purpose: `i` must become `İ`, not `I`. Every name in this product is Turkish.
- Initials take the first letter of the first two words — Turkish given-name + surname. Do not extend it to three; `Mehmed Âkif Ersoy` should read `MÂ`.
- Two letters max. If the name is one word, one letter is correct.
