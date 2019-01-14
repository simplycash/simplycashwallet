import { Component } from '@angular/core'
import { IonicPage, LoadingController, NavController, NavParams } from 'ionic-angular'
import { TranslateService } from '@ngx-translate/core';
import { Wallet } from '../../providers/providers'

@IonicPage()
@Component({
  selector: 'page-addresses',
  templateUrl: 'addresses.html',
})
export class AddressesPage {

  public receiveAddrs: { address: string, path: number[] }[]
  public changeAddrs: { address: string, path: number[] }[]
  public unspentAddrs: { address: string, balance: string, path: number[] }[]
  public type: string = 'receive'

  constructor(
    public loadingCtrl: LoadingController,
    public navCtrl: NavController,
    public navParams: NavParams,
    public translate: TranslateService,
    public wallet: Wallet
  ) {
  }

  async ionViewDidLoad() {
    let loader = this.loadingCtrl.create({
      content: this.translate.instant('LOADING_ADDRESSES')+'...'
    })
    await loader.present()
    let ara: string[] = this.wallet.getAllReceiveAddresses()
    ara.length = Math.max(0, ara.length - 20)
    this.receiveAddrs = ara.map((addr: string, i: number, arr: string[]) => {
      return {
        address: addr,
        path: [0, i]
      }
    }).reverse()
    let aca: string[] = this.wallet.getAllChangeAddresses()
    aca.length = Math.max(0, aca.length - 20)
    this.changeAddrs = aca.map((addr: string, i: number, arr: string[]) => {
      return {
        address: addr,
        path: [1, i]
      }
    }).reverse()
    this.unspentAddrs = this.wallet.getCacheUtxos().map((utxo: any) => {
      return {
        address: utxo.address,
        balance: this.wallet.convertUnit('SATS', 'BSV', utxo.satoshis.toString()),
        path: utxo.path
      }
    })
    await loader.dismiss()
  }

  pushAddressPage(addr: any) {
    this.navCtrl.push('AddressPage', {
      address: addr.address,
      path: addr.path
    })
  }

}
