Centered modal with a blurred scrim, sticky header and optional footer — used for the full-müfredat overlay.

```jsx
<Dialog
  eyebrow="Tam Müfredat" title="Bina ve İzhar Şerhi"
  onClose={() => setOpen(false)}
  headerExtra={<Button variant="ghost" icon={<Icon name="download" size={14} />}>PDF olarak indir</Button>}
  actions={<><span style={{color:"var(--muted)",fontSize:"var(--fs-12)"}}>Son güncelleme: Ekim 2026</span>
            <Button icon={<Icon name="play" filled size={13} />}>Sıradaki derse devam et</Button></>}
>
  {weeks.map(w => <WeekAccordion key={w.week} {...w} />)}
</Dialog>
```

**Always pass `contained`** when the dialog renders inside a fixed-size frame, or the
scrim escapes and covers the whole page.
