import { Component } from '@angular/core'
import { TranslateService } from '@ngx-translate/core'
import { AlertController, App, IonicPage, LoadingController, NavController, NavParams, Platform, ViewController } from 'ionic-angular'
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
  public cryptoUnit: string
  public supportedCryptoUnits: string[]
  public currency: string
  public supportedCurrencies: string[]
  public protection: string
  public supportedProtections: string[]
  public isLeaving: boolean

  constructor(
    public alertCtrl: AlertController,
    public app: App,
    public loadingCtrl: LoadingController,
    public navCtrl: NavController,
    public navParams: NavParams,
    public platform: Platform,
    public translate: TranslateService,
    public viewCtrl: ViewController,
    public wallet: Wallet
  ) {
    this.refresh()
  }

  refresh() {
    this.cryptoUnit = this.wallet.getPreferredCryptoUnit()
    this.supportedCryptoUnits = this.wallet.getSupportedCryptoUnits()
    this.currency = this.wallet.getPreferredCurrency()
    this.supportedCurrencies = this.wallet.getSupportedCurrencies()
    this.protection = this.wallet.getPreferredProtection()
    this.supportedProtections = this.wallet.getSupportedProtections()
  }

  pushSendPage() {
    if (this.isLeaving) {
      return
    }
    this.isLeaving = true
    this.viewCtrl.dismiss()
    this.app.getRootNav().push('SendPage')
  }

  pushMorePage() {
    if (this.isLeaving) {
      return
    }
    this.isLeaving = true
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
      this.refresh()
    }
  }

}
