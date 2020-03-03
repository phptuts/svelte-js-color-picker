<script>
  import Slider from "@smui/slider";
  export let color = 0;
  export let bgColor = "coral";
  export let min = 0;
  export let max = 255;
</script>

<div bp="grid">
  <div bp="10 offset-2">
    <Slider
      style="--mdc-theme-secondary: {bgColor}"
      {min}
      {max}
      bind:value={color}
      discrete="true" />
  </div>
</div>
