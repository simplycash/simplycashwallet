import { Component, NgZone, ViewChild } from '@angular/core'
import { Globalization } from '@ionic-native/globalization';
import { LocalNotifications } from '@ionic-native/local-notifications'
import { SplashScreen } from '@ionic-native/splash-screen'
import { StatusBar } from '@ionic-native/status-bar'
import { TranslateService } from '@ngx-translate/core'
import { AlertController, App, Config, NavController, Platform } from 'ionic-angular'

import { Wallet } from '../providers/providers'

(window as any).handleOpenURL = (url: string) => {
  (window as any).handleOpenURL_LastURL = url
}


@Component({
  template: `<ion-nav #content [root]="rootPage"></ion-nav>`
})
export class MyApp {
  @ViewChild('content') navCtrl: NavController
  rootPage: string

  constructor(
    private alertCtrl: AlertController,
    private app: App,
    private config: Config,
    private globalization: Globalization,
    private localNotifications: LocalNotifications,
    private ngZone: NgZone,
    private platform: Platform,
    private statusBar: StatusBar,
    private splashScreen: SplashScreen,
    private translate: TranslateService,
    private wallet: Wallet
  ) {
    platform.ready().then(async () => {
      if (this.platform.is('android')) {
        this.statusBar.backgroundColorByHexString("#00000000");
      }
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
      try {
        await this.initTranslate()
      } catch (err) {
        console.log(err)
      }
      try {
        await this.wallet.startWallet()
        await this.navCtrl.setRoot('HomePage')
        this.splashScreen.hide()
      } catch (err) {
        console.log(err)
        this.alertCtrl.create({
          enableBackdropDismiss: false,
          title: this.translate.instant('ERROR'),
          message: this.translate.instant('ERR_START_WALLET_FAILED'),
          buttons: ['ok']
        }).present()
      }
    })
  }

  async initTranslate() {
    this.translate.setDefaultLang('en')
    let browserLang: string
    let prefix: string
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
          this.translate.use('zh-cmn-Hant')
        } else /*if (browserLang.match(/-CN|CHS|Hans/i))*/ {
          this.translate.use('zh-cmn-Hans')
        }
      } else {
        this.translate.use(prefix)
      }
    } else {
      this.translate.use('en')
    }
    this.translate.get(['BACK']).subscribe(values => {
      this.config.set('ios', 'backButtonText', values.BACK)
    })
  }
}
