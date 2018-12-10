import { Component } from '@angular/core'
import { TranslateService } from '@ngx-translate/core'
import { AlertController, App, IonicPage, NavController, NavParams, Platform, ViewController } from 'ionic-angular'
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
  // private useCashAddr: boolean

  constructor(
    public alertCtrl: AlertController,
    public app: App,
    public navCtrl: NavController,
    public navParams: NavParams,
    private platform: Platform,
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
    // this.useCashAddr = this.wallet.getPreferredAddressFormat() === 'cashaddr'
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

  // setAddressFormat() {
  //   if (this.useCashAddr) {
  //     return this.wallet.setPreferredAddressFormat('cashaddr').catch((err: any) => {console.log(err)})
  //   } else {
  //     return this.wallet.setPreferredAddressFormat('legacy').catch((err: any) => {console.log(err)})
  //   }
  // }

}
