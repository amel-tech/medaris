One week of a müfredat — status medallion, "Hafta N" eyebrow, title, right-aligned meta, and a disclosure body holding `LessonRow`s.

```jsx
<WeekAccordion
  week={3} title="Dördüncü ve Beşinci Bab" state="active" open
  summary="فَتَح bâbı ve harf-i halk illetleri."
  meta={<><span>4 ders</span><span>135 dk</span></>}
  onToggle={() => setOpen(o => !o)}
>
  <LessonRow title="Beşinci babın şerhi" type="video" duration="31 dk" current />
</WeekAccordion>
```

`state="locked"` renders a dashed medallion with a lock and is not expandable.
