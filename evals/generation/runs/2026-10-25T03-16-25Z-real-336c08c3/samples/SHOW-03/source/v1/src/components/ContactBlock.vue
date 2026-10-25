<script setup lang="ts">
const email = 'linxia@example.com';
</script>

<template>
  <section data-ai-component="contact-block" class="contact-block">
    <h2 class="contact-block__title">联系方式</h2>
    <p class="contact-block__intro">欢迎通过邮件联系我，商拍与约片均可。</p>
    <p class="contact-block__email" data-testid="contact-email">{{ email }}</p>
  </section>
</template>

<style scoped>
.contact-block {
  background: #ffffff;
  border-radius: 10px;
  padding: 1.5rem;
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.08);
}

.contact-block__title {
  font-size: 1.5rem;
  margin: 0 0 0.75rem;
}

.contact-block__intro {
  margin: 0 0 0.75rem;
  color: #4b5563;
}

.contact-block__email {
  margin: 0;
  font-size: 1.1rem;
  font-weight: 600;
  color: #1f2937;
}
</style>
