import { Component, NgZone, ViewChild } from '@angular/core'
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
    private localNotifications: LocalNotifications,
    private ngZone: NgZone,
    private platform: Platform,
    private statusBar: StatusBar,
    private splashScreen: SplashScreen,
    private translate: TranslateService,
    private wallet: Wallet
  ) {
    platform.ready().then(() => {
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
    })

    this.wallet.startWallet().then(() => {
      return this.navCtrl.setRoot('HomePage')
      // this.rootPage = 'HomePage'
    }).then(() => {
      this.splashScreen.hide()
    }).catch((err: any) => {
      console.log(err)
    })

    this.initTranslate()
  }

  initTranslate() {
    // Set the default language for translation strings, and the current language.
    this.translate.setDefaultLang('en')
    // const browserLang = this.translate.getBrowserLang()

    // if (browserLang) {
    //   if (browserLang === 'zh') {
    //     const browserCultureLang = this.translate.getBrowserCultureLang()
    //
    //     if (browserCultureLang.match(/-CN|CHS|Hans/i)) {
    //       this.translate.use('zh-cmn-Hans')
    //     } else if (browserCultureLang.match(/-TW|CHT|Hant/i)) {
    //       this.translate.use('zh-cmn-Hant')
    //     }
    //   } else {
    //     this.translate.use(this.translate.getBrowserLang())
    //   }
    // } else {
      this.translate.use('en') // Set your language here
    // }

    this.translate.get(['BACK_BUTTON_TEXT']).subscribe(values => {
      this.config.set('ios', 'backButtonText', values.BACK_BUTTON_TEXT)
    })
  }
}
