One lesson line inside a week. The `type` fixes its icon and color — don't restyle per screen.

```jsx
<LessonRow title="Birinci babın îsâgûcîsi" type="video" duration="28 dk" source="Bina · s. 4-9" done />
<LessonRow title="Beşinci babın şerhi" type="video" duration="31 dk" current />
<LessonRow title="Hafta sonu müzakeresi" type="live" duration="45 dk" typeLabel="Canlı ders" />
```

`current` marks where the talebe is (accent bar + tint); `done` strikes the title through.
In the Nizam curriculum editor only `type="live"` may be used.
