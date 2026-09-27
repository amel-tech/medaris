Initials avatar (there is no photo avatar in this system) plus `AvatarStack` for overlapping groups of müderris or talebe.

```jsx
<Avatar initials="AH" hue={145} size={32} />
<Avatar initials="DU" shape="square" size={34} ring={false} />

<AvatarStack
  people={[{initials:"MÖ",hue:28},{initials:"AH",hue:145},{initials:"SY",hue:270}]}
  size={30}
/>
```

Circles in Tedris, squares in Nizam sidebars and tables. Keep a person's `hue` stable
across screens.
