# simply cash - bitcoin sv wallet
simply cash is built using [Ionic Framework](https://ionicframework.com)

1. follow step 1 [here](https://ionicframework.com/getting-started) to install ionic and android platform tools
2. clone and cd into this directory
3. `npm install`
4. modify node_modules/@ionic-native/local-notifications/index.d.ts:
```javascript
export interface ILocalNotification {
  ...
  // add this line within the ILocalNotification interface
  foreground?: boolean;
  ...
}
```
5. `ionic cordova build android --prod` or `ionic cordova build ios --prod`

follow this [guide](https://ionicframework.com/docs/intro/deploying/) if you have difficulties deploying to android / ios device
