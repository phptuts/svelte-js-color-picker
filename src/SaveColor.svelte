<script>
  import Slider from "./Slider.svelte";
  import Textfield from "@smui/textfield";
  import Button, { Label } from "@smui/button";
  import { rgbToHex } from "./helpers/color.js";

  let red = 100;
  let green = 0;
  let blue = 100;
  let name = "";
  $: hex = rgbToHex(red, green, blue);
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
</style>

<div class="form" bp="grid vertical-end">

  <div bp="8 offset-2">
    <Textfield bind:value={name} label="Name" fullwidth="true" />

  </div>
  <div bp="2">
    <Button style="width: 100%;" variant="unelevated" color="primary">
      <Label>Save Color</Label>
    </Button>
  </div>
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
    ({red}, {green}, {blue})
  </div>
  <div bp="5">
    HEX
    <br />
    {hex}
  </div>
</div>
