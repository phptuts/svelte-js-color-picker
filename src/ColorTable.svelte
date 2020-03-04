<script>
  import DataTable, { Head, Body, Row, Cell } from "@smui/data-table";
  import { onMount } from "svelte";

  import Textfield from "@smui/textfield";
  import Switch from "@smui/switch";
  import FormField from "@smui/form-field";
  import colorStore from "./stores/color-store.js";
  import selectedColor from "./stores/selected-color.js";
  import { rgbToHex } from "./helpers/color.js";

  let filter = "";
  let favoriteOnly = false;
  let colors = [];
  $: tableColors = getTableColors(colors, favoriteOnly, filter).sort((a, b) =>
    a.name.localeCompare(b.name)
  );

  function getTableColors(colorList, favOnly, filterName) {
    const tableColors = favOnly ? colors.filter(c => c.isFavorite) : colors;
    if (filterName) {
      return tableColors.filter(c => c.name.indexOf(filter) > -1);
    }

    return tableColors;
  }

  function selectColor(id) {
    console.log("called selectColor");

    const { red, green, blue, name } = colors.find(c => c.id === id);
    selectedColor.selectColor(red, green, blue, name, id);
  }

  function unFav(id) {
    colorStore.updateFavorite(id, false);
  }

  function fav(id) {
    console.log("called fav");
    colorStore.updateFavorite(id, true);
  }

  function deleteColor(id) {
    colorStore.deleteColor(id);
  }

  onMount(() => {
    colorStore.subscribe(colorList => {
      colors = colorList;
    });
  });
</script>

<style>
  div[bp="grid"] {
    margin-top: 20px;
  }
  :global(.mdc-data-table__header-cell, .mdc-data-table__content) {
    text-align: center;
  }
  :global(.favorite) {
    float: right;
  }
  :global(tbody > tr) {
    cursor: pointer;
  }
  i.material-icons {
    cursor: pointer;
  }
</style>

<div bp="grid vertical-end">
  <div bp="offset-2 5">
    <Textfield bind:value={filter} label="Filter Colors" fullwidth="true" />
  </div>
  <div bp="5 ">
    <FormField class="favorite">
      <Switch bind:checked={favoriteOnly} />
      <span slot="label">Favorite</span>
    </FormField>
  </div>
</div>
<div bp="grid">
  <div bp="offset-2 10">
    <DataTable style="width: 100%">
      <Head>
        <Row>
          <Cell>Fav</Cell>
          <Cell>Name</Cell>
          <Cell>Color</Cell>
          <Cell>HEX</Cell>
          <Cell />

        </Row>
      </Head>
      <Body>
        {#each tableColors as tableColor (tableColor.id)}
          <Row on:click={selectColor(tableColor.id)}>
            <Cell>
              {#if tableColor.isFavorite}
                <i
                  style="color: red;"
                  on:click|stopPropagation={unFav(tableColor.id)}
                  class="material-icons">
                  favorite
                </i>
              {:else}
                <i
                  style="color: red;"
                  on:click|stopPropagation={fav(tableColor.id)}
                  class="material-icons">
                  favorite_border
                </i>
              {/if}
            </Cell>
            <Cell>{tableColor.name}</Cell>
            <Cell
              style="background-color: {rgbToHex(tableColor.red, tableColor.green, tableColor.blue)}" />
            <Cell>
              {rgbToHex(tableColor.red, tableColor.green, tableColor.blue)}
            </Cell>
            <Cell>
              <i
                on:click|stopPropagation={deleteColor(tableColor.id)}
                class="material-icons">
                delete
              </i>
            </Cell>
          </Row>
        {/each}
      </Body>
    </DataTable>
  </div>
</div>
