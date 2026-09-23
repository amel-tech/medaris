One row of sidebar navigation. Active state is a soft `--nav-active` fill — never a colored left bar.

```jsx
<SidebarItem icon={<Icon name="home" size={19} />} label="Köşkler" active />
<SidebarItem icon={<Icon name="table" size={19} />} label="Desteler" />
<SidebarItem collapsed icon={<Icon name="home" size={20} />} label="Köşkler" active />
```

Group rows under a small `--faint` section label ("İçerik"). Use `collapsed` for the
66px icon rail.
