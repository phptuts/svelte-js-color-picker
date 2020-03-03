<script>
  import DataTable, { Head, Body, Row, Cell } from "@smui/data-table";
  import Textfield from "@smui/textfield";
  let filter = "";
</script>

<style>
  div[bp="grid"] {
    margin-top: 20px;
  }
  :global(.mdc-data-table__header-cell, .mdc-data-table__content) {
    text-align: center;
  }
</style>

<div bp="grid">
  <div bp="offset-2 10">
    <Textfield bind:value={filter} label="Filter Colors" fullwidth="true" />

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
        <Row>
          <Cell>
            <!-- <i style="color: red;" class="material-icons">favorite_border</i> -->
            <i style="color: red;" class="material-icons">favorite</i>
          </Cell>
          <Cell>Light Blue</Cell>
          <Cell style="background-color: purple" />
          <Cell>#FF3Afb</Cell>
          <Cell>
            <i class="material-icons">delete</i>
          </Cell>
        </Row>
      </Body>
    </DataTable>
  </div>
</div>
