import { writable } from 'svelte/store';

const selectedColor = writable(null);

export default {
  subscribe: selectedColor.subscribe,
  selectColor: (red, green, blue, name, id) => {
    selectedColor.set({ red, green, blue, name, id });
  }
};
