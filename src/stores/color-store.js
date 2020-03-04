import { writable } from 'svelte/store';

const colorStore = writable([]);

const addColor = (red, green, blue, name) => {
  colorStore.update((items) => {
    items.push({ red, green, blue, name, id: Date.now(), isFavorite: false });

    return items;
  });
};

const updateColor = (red, green, blue, name, id) => {
  colorStore.update((items) => {
    const updateItems = items.filter((i) => i.id !== id);
    const item = items.find((i) => i.id === id);

    const isFavorite = item ? item.isFavorite : false;

    return [...updateItems, { red, green, blue, name, id, isFavorite }];
  });
};

const updateFavorite = (itemId, isFavorite) => {
  colorStore.update((items) => {
    const updateItems = items.filter((i) => i.id !== itemId);
    const item = items.find((i) => i.id === itemId);
    const { red, green, blue, name, id } = item;

    return [...updateItems, { red, green, blue, name, id, isFavorite }];
  });
};

const deleteColor = (id) => {
  colorStore.update((items) => {
    return items.filter((i) => i.id !== id);
  });
};

if (localStorage.getItem('color-list')) {
  colorStore.set(JSON.parse(localStorage.getItem('color-list')));
}

colorStore.subscribe((colors) => {
  localStorage.setItem('color-list', JSON.stringify(colors));
});

export default {
  subscribe: colorStore.subscribe,
  addColor,
  updateColor,
  deleteColor,
  updateFavorite
};
