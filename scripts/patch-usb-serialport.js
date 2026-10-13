const fs = require('fs');
const path = require('path');

const target = path.join(__dirname, '..', 'node_modules', 'react-native-usb-serialport-for-android', 'android', 'build.gradle');

if (fs.existsSync(target)) {
  let content = fs.readFileSync(target, 'utf8');
  if (content.includes('jcenter()')) {
    content = content.replace(/jcenter\(\)/g, '// jcenter() - removed for Gradle 9+ compatibility');
    fs.writeFileSync(target, content, 'utf8');
    console.log('✅ Patched react-native-usb-serialport-for-android build.gradle (removed jcenter)');
  }
}
