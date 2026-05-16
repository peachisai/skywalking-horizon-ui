<!--
  Licensed to the Apache Software Foundation (ASF) under one or more
  contributor license agreements.  See the NOTICE file distributed with
  this work for additional information regarding copyright ownership.
  The ASF licenses this file to You under the Apache License, Version 2.0
  (the "License"); you may not use this file except in compliance with
  the License.  You may obtain a copy of the License at

      http://www.apache.org/licenses/LICENSE-2.0

  Unless required by applicable law or agreed to in writing, software
  distributed under the License is distributed on an "AS IS" BASIS,
  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
  See the License for the specific language governing permissions and
  limitations under the License.
-->
<script setup lang="ts">
defineProps<{ title: string }>();
</script>

<template>
  <div class="section-break">
    <span class="line" />
    <h3>{{ title }}</h3>
    <span class="line" />
  </div>
</template>

<style scoped>
.section-break {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 4px 2px;
}
.section-break h3 {
  margin: 0;
  font-size: 10.5px;
  font-weight: 700;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--sw-fg-2);
  white-space: nowrap;
}
.line {
  flex: 1;
  height: 1px;
  background: var(--sw-line-2);
}
.line:first-child { max-width: 16px; }
</style>
