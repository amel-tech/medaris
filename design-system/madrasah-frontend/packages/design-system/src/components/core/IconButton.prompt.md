Square icon-only action — used for table row actions (eye/trash), inline overflow menus, and the compact "+" in list headers.

```jsx
<IconButton label="Görüntüle" icon={<Icon name="eye" size={17} />} />
<IconButton label="Sil" icon={<Icon name="trash" size={17} />} />
<IconButton variant="bare" label="Daha fazla" icon={<Icon name="more" size={16} />} />
<IconButton variant="solid" label="Yeni köşk" icon={<Icon name="plus" size={16} />} size="sm" />
```

`label` is mandatory. Use `bare` inside dense rows where a border would add noise.
