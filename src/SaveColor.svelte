<script>
  import { onMount } from "svelte";
  import Slider from "./Slider.svelte";
  import Textfield from "@smui/textfield";
  import HelperText from "@smui/textfield/helper-text/index";

  import Button, { Label } from "@smui/button";
  import { rgbToHex } from "./helpers/color.js";
  import colorStore from "./stores/color-store.js";
  import selectedColor from "./stores/selected-color.js";

  let mode = "new";
  let id = null;
  let red = 100;
  let green = 200;
  let blue = 10;
  let name = "";

  $: canSaveColor = name.length >= 3;

  onMount(() => {
    reset();
    selectedColor.subscribe(color => {
      if (!color) {
        return;
      }
      console.log(color, "color");
      ({ red, green, blue, name, id } = color);
      mode = "edit";
    });
  });

  $: hex = rgbToHex(red, green, blue);

  function submitColor() {
    if (mode === "new") {
      saveColor();
      return;
    }

    editColor();
  }

  function saveColor() {
    colorStore.addColor(red, green, blue, name);
    reset();
  }

  function editColor() {
    colorStore.updateColor(red, green, blue, name, id);
    reset();
  }

  function reset() {
    red = 200;
    green = 100;
    blue = 10;
    mode = "new";
    name = "";
  }
</script>

<style>
  .form {
    margin-bottom: 20px;
  }
  .color-display {
    height: 200px;
  }
  .color-numbers {
    margin-top: 20px;
  }
  .color-numbers > div {
    height: 50px;
    border: solid 1px gray;
    border-radius: 2px;
    text-align: center;
    justify-content: space-around;
    padding: 5px;
  }
  :global(.save-color-btn) {
    width: 100%;
  }
</style>

<div class="form" bp="grid vertical-end">

  <div bp="8 offset-2">
    <form on:submit|preventDefault={submitColor}>
      <Textfield bind:value={name} label="Name" fullwidth="true" />
    </form>
  </div>
  {#if mode === 'edit'}
    <div bp="1">
      <Button
        on:click={editColor}
        disabled={!canSaveColor}
        variant="unelevated"
        color="primary">
        <Label>Edit Color</Label>
      </Button>

    </div>
    <div bp="1">
      <Button on:click={reset} variant="unelevated" color="secondary">
        <Label>Cancel</Label>
      </Button>
    </div>
  {:else}
    <div bp="2">
      <Button
        on:click={saveColor}
        disabled={!canSaveColor}
        class="save-color-btn"
        variant="unelevated"
        color="primary">
        <Label>Save Color</Label>
      </Button>
    </div>
  {/if}
</div>

<div class="color-controls">
  <Slider bind:color={red} bgColor="#AA0000" />
  <Slider bind:color={green} bgColor="#00AA00" />
  <Slider bind:color={blue} bgColor="#0000AA" />

</div>
<div bp="grid">
  <div
    class="color-display"
    style="background-color: rgb({red}, {green}, {blue})"
    bp="offset-2 10" />
</div>

<div class="color-numbers" bp="grid">
  <div bp="offset-2 5">
    RGB
    <br />
    r={red}, g={green}, b={blue}
  </div>
  <div bp="5">
    HEX
    <br />
    {hex}
  </div>
</div>
