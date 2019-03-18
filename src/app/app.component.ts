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

// if (window.location.hash === '#/recover') {
//   (window as any).recoveryMode = true
// }

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
      // if (this.platform.is('android')) {
      //   this.statusBar.backgroundColorByHexString("#00000000");
      // }
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
          buttons: [this.translate.instant('OK')]
        }).present()
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
    if (browserLang && prefix.match(/^(en|es|ja|ko|zh|yue)$/gi)) {
      if (prefix.match(/^(zh|yue)$/gi)) {
        if (!browserLang.match(/-Hans/i) && browserLang.match(/-TW|-CHT|-Hant|-HK|-yue/i)) {
          lang = 'zh-cmn-Hant'
        } else {
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

}
