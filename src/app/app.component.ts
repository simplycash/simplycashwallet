import { Component, NgZone, ViewChild } from '@angular/core'
import { Globalization } from '@ionic-native/globalization';
import { LocalNotifications } from '@ionic-native/local-notifications'
import { SplashScreen } from '@ionic-native/splash-screen'
import { StatusBar } from '@ionic-native/status-bar'
import { TranslateService } from '@ngx-translate/core'
import { AlertController, App, Config, LoadingController, NavController, Platform } from 'ionic-angular'

import 'rxjs/add/operator/first'
import { Wallet } from '../providers/providers'

(window as any).handleOpenURL = (url: string) => {
  (window as any).handleOpenURL_LastURL = url
}

if (window.location.hash === '#/recover') {
  (window as any).recoveryMode = true
}

window.location.hash = ''

@Component({
  template: `<ion-nav #content [root]="rootPage"></ion-nav>`
})
export class MyApp {
  @ViewChild('content') navCtrl: NavController
  rootPage: string

  constructor(
    public alertCtrl: AlertController,
    public app: App,
    public config: Config,
    public globalization: Globalization,
    public loadingCtrl: LoadingController,
    public localNotifications: LocalNotifications,
    public ngZone: NgZone,
    public platform: Platform,
    public statusBar: StatusBar,
    public splashScreen: SplashScreen,
    public translate: TranslateService,
    public wallet: Wallet
  ) {
    platform.ready().then(async () => {
      if (this.platform.is('android')) {
        this.statusBar.backgroundColorByHexString("#00000000");
      }
      if (this.platform.is('cordova')) {
        try {
          this.localNotifications.on('click').subscribe((notification) => {
            if (
              this.app._appRoot._overlayPortal.getActive() ||
              this.app._appRoot._loadingPortal.getActive() ||
              this.app._appRoot._modalPortal.getActive() ||
              this.app._appRoot._toastPortal.getActive()
            ) {
              return
            }
            let data: any = notification.data
            if (data.page === 'HistoryPage' && this.navCtrl.getActive().component.pageName !== 'HistoryPage') {
              this.ngZone.run(() => {
                this.navCtrl.push('HistoryPage', data.navParams)
              })
            }
          })
        } catch (err) {
          console.log(err)
        }
      }
      try {
        await this.initTranslate()
      } catch (err) {
        console.log(err)
      }
      if (window.hasOwnProperty('recoveryMode')) {
        delete (window as any).recoveryMode
        await this.promptForMnemonic()
      } else {
        try {
          await this.wallet.startWallet()
          await this.navCtrl.setRoot('HomePage')
          if (this.platform.is('cordova')) {
            this.splashScreen.hide()
          }
        } catch (err) {
          console.log(err)
          this.alertCtrl.create({
            enableBackdropDismiss: false,
            title: this.translate.instant('ERROR'),
            message: this.translate.instant('ERR_START_WALLET_FAILED'),
            buttons: ['ok']
          }).present()
        }
      }
    })
  }

  async initTranslate() {
    this.translate.setDefaultLang('en')
    let browserLang: string
    let prefix: string
    let lang: string
    if (this.platform.is('cordova')) {
      browserLang = (await this.globalization.getPreferredLanguage()).value || ''
    } else {
      browserLang = navigator.language || ''
    }
    browserLang = browserLang.toLowerCase()
    prefix = browserLang.split('-')[0]
    if (browserLang && ['en', 'ja', 'zh'].indexOf(prefix) !== -1) {
      if (prefix === 'zh') {
        if (browserLang.match(/-TW|CHT|Hant|HK|yue/i)) {
          lang = 'zh-cmn-Hant'
        } else /*if (browserLang.match(/-CN|CHS|Hans/i))*/ {
          lang = 'zh-cmn-Hans'
        }
      } else {
        lang = prefix
      }
    } else {
      lang = 'en'
    }
    (window as any).translationLanguage = lang
    await new Promise((resolve, reject) => {
      this.translate.use(lang).first().subscribe(() => {
        resolve()
      })
    })
    this.translate.get(['BACK']).subscribe(values => {
      this.config.set('ios', 'backButtonText', values.BACK)
    })
  }

  // copied from more.ts, no cancel button
  async promptForMnemonic() {
    let recoverAlert = this.alertCtrl.create({
      enableBackdropDismiss: false,
      title: this.translate.instant('RECOVER_WALLET'),
      message: `${this.translate.instant('RECOVERY_HINT')}<br>(${this.translate.instant('DERIVATION_PATH')}: m/44'/145'/0')`,
      inputs: [{
        name: 'mnemonic',
        placeholder: this.translate.instant('RECOVERY_PHRASE')
      }],
      buttons: [/*{
        text: this.translate.instant('CANCEL'),
        handler: data => {}
      },*/{
        text: this.translate.instant('RECOVER'),
        handler: data => {
          if (this.mnemonicIsValid(data.mnemonic)) {
            recoverAlert.dismiss().then(() => {
              this.recover(data.mnemonic)
            })
          }
          return false
        }
      }]
    })
    await recoverAlert.present()
  }

  // copied from more.ts
  mnemonicIsValid(m: string) {
    m = m.trim()
    if (!this.wallet.validateMnemonic(m)) {
      this.alertCtrl.create({
        enableBackdropDismiss: false,
        title: this.translate.instant('ERROR'),
        message: this.translate.instant('ERR_INVALID_RECOVERY_PHRASE'),
        buttons: ['ok']
      }).present()
      return false
    } else {
      return true
    }
  }

  // copied from more.ts
  async recover(m: string) {
    m = m.trim()
    let error: Error
    let loader = this.loadingCtrl.create({
      content: this.translate.instant('RECOVERING')+'...'
    })
    loader.present().then(() => {
      return this.wallet.recoverWalletFromMnemonic(m)
    }).then(() => {
      return this.app.getRootNav().setRoot('HomePage')
    }).catch((err: any) => {
      console.log(err)
      error = err
    }).then(() => {
      return loader.dismiss()
    }).then(() => {
      if (!error) {
        this.alertCtrl.create({
          enableBackdropDismiss: false,
          title: this.translate.instant('SUCCESS'),
          message: this.translate.instant('RECOVER_SUCCESS'),
          buttons: ['ok']
        }).present()
      } else {
        this.alertCtrl.create({
          enableBackdropDismiss: false,
          title: this.translate.instant('ERROR'),
          message: this.translate.instant('RECOVER_FAILED'),
          buttons: ['ok']
        }).present()
      }
    })
  }
}
