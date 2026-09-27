import { createApp } from 'vue'
import { ElButton } from 'element-plus'
import 'element-plus/es/components/button/style/css'
import App from './App.vue'
import { router } from './router'
import './styles.css'

createApp(App).use(router).component('ElButton', ElButton).mount('#app')
