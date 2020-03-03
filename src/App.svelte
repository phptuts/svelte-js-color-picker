<script>
  import SavedColor from "./SaveColor.svelte";
  import ColorTable from "./ColorTable.svelte";
</script>

<style>
  div div div {
    background-color: rgb(219, 100, 20);
  }
</style>

<div bp="grid">
  <div bp="10 offset-2">
    <h1>Color Picker</h1>
  </div>
</div>

<SavedColor />
<ColorTable />
