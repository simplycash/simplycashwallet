import { Component } from '@angular/core'
import { TranslateService } from '@ngx-translate/core'
import { AlertController, App, IonicPage, NavController, NavParams, ViewController } from 'ionic-angular'
import { InAppBrowser } from '@ionic-native/in-app-browser'
import { Wallet } from '../../providers/providers'

/**
* The Settings page is a simple form that syncs with a Settings provider
* to enable the user to customize settings for the app.
*
*/
@IonicPage()
@Component({
  selector: 'page-settings',
  templateUrl: 'settings.html'
})
export class SettingsPage {
  private cryptoUnit: string
  private supportedCryptoUnits: string[]
  private currency: string
  private supportedCurrencies: string[]
  private protection: string
  private supportedProtections: string[]
  private useCashAddr: boolean
  // private canUseFingerprint: boolean = false
  // private useFingerprint: boolean

  constructor(
    public alertCtrl: AlertController,
    public app: App,
    private iab: InAppBrowser,
    public navCtrl: NavController,
    public navParams: NavParams,
    public translate: TranslateService,
    public viewCtrl: ViewController,
    private wallet: Wallet
  ) {
    this.cryptoUnit = this.wallet.getPreferredCryptoUnit()
    this.supportedCryptoUnits = this.wallet.getSupportedCryptoUnits()
    this.currency = this.wallet.getPreferredCurrency()
    this.supportedCurrencies = this.wallet.getSupportedCurrencies()
    this.protection = this.wallet.getPreferredProtection()
    this.supportedProtections = this.wallet.getSupportedProtections()
    this.useCashAddr = this.wallet.getPreferredAddressFormat() === 'cashaddr'
    // this.useFingerprint = this.wallet.isUsingFingerprint()
    // this.wallet.canUseFingerprint().then(() => {
    //   this.canUseFingerprint = true
    // }).catch((err: any) => {
    //   this.canUseFingerprint = false
    // })
  }

  pushHistoryPage() {
    this.viewCtrl.dismiss()
    this.app.getRootNav().push('HistoryPage')
  }

  pushSendPage() {
    this.viewCtrl.dismiss()
    this.app.getRootNav().push('SendPage')
  }

  pushMorePage() {
    this.viewCtrl.dismiss()
    this.app.getRootNav().push('MorePage')
  }

  setCryptoUnit() {
    return this.wallet.setPreferredCryptoUnit(this.cryptoUnit).catch((err: any) => {console.log(err)})
  }

  setCurrency() {
    return this.wallet.setPreferredCurrency(this.currency).catch((err: any) => {console.log(err)})
  }

  async setProtection() {
    if (this.protection === this.wallet.getPreferredProtection()) {
      return
    }
    try {
      let m: string = await this.wallet.authorize()
      await this.wallet.setPreferredProtection(this.protection, m)
    } catch (err) {
      if (err.message !== 'cancelled') {
        console.log(err)
      }
      this.protection = this.wallet.getPreferredProtection()
    }
  }

  setAddressFormat() {
    if (this.useCashAddr) {
      return this.wallet.setPreferredAddressFormat('cashaddr').catch((err: any) => {console.log(err)})
    } else {
      return this.wallet.setPreferredAddressFormat('legacy').catch((err: any) => {console.log(err)})
    }
  }

  // setFingerprint() {
  //   if (this.useFingerprint === this.wallet.isUsingFingerprint()) {
  //     return
  //   }
  //   if (!this.useFingerprint) {
  //     return this.wallet.setUsingFingerprint(false).catch((err: any) => {
  //       this.useFingerprint = this.wallet.isUsingFingerprint()
  //     })
  //   }
  //   let reminderAlert = this.alertCtrl.create({
  //     enableBackdropDismiss: false,
  //     title: 'Warning!',
  //     message: 'DO BACKUP YOUR RECOVERY PHRASE BEFORE ENABLING FINGERPRINT.<br>If for some reason the fingerprint data is lost or changed, you will need to recover this wallet using the recovery phrase.<br>The recovery phrase can be found in settings > more... > backup wallet',
  //     buttons: [{
  //       text: 'cancel',
  //       handler: data => {
  //         this.useFingerprint = false
  //       }
  //     },{
  //       text: 'enable',
  //       handler: data => {
  //         reminderAlert.dismiss().then(() => {
  //           this.wallet.setUsingFingerprint(true).catch((err: any) => {
  //             // this.alertCtrl.create({
  //             //   message: err
  //             // }).present()
  //             this.useFingerprint = this.wallet.isUsingFingerprint()
  //           })
  //         })
  //         return false
  //       }
  //     }]
  //   })
  //   reminderAlert.present()
  // }

}
