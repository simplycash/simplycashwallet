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

  public _receiveAddrs: { address: string, path: number[], isGap: boolean }[]
  public _changeAddrs: { address: string, path: number[], isGap: boolean }[]
  public _unspentAddrs: { address: string, balance: string, path: number[] }[]
  public receiveAddrs: { address: string, path: number[], isGap: boolean }[]
  public changeAddrs: { address: string, path: number[], isGap: boolean }[]
  public unspentAddrs: { address: string, balance: string, path: number[] }[]
  public type: string = 'receive'
  public isShowingGap: boolean = false

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
    this._receiveAddrs = ara.map((addr: string, i: number, arr: string[]) => {
      return {
        address: addr,
        path: [0, i],
        isGap: i >= ara.length - 20
      }
    }).reverse()
    this.receiveAddrs = this._receiveAddrs
    let aca: string[] = this.wallet.getAllChangeAddresses()
    this._changeAddrs = aca.map((addr: string, i: number, arr: string[]) => {
      return {
        address: addr,
        path: [1, i],
        isGap: i >= aca.length - 20
      }
    }).reverse()
    this.changeAddrs = this._changeAddrs
    this._unspentAddrs = this.wallet.getCacheUtxos().map((utxo: any) => {
      return {
        address: utxo.address,
        balance: this.wallet.convertUnit('SATS', 'BSV', utxo.satoshis.toString()),
        path: utxo.path
      }
    })
    this.unspentAddrs = this._unspentAddrs
    await loader.dismiss()
  }

  updateFilter(ev: any) {
    if (typeof ev.target.value === 'undefined') {
      (window.document.querySelector('#addresses-page-search-bar input') as any).blur()
    }
    let v: string = ev.target.value || ''
    this.receiveAddrs = this._receiveAddrs.filter(o => o.address.indexOf(v) !== -1)
    this.changeAddrs = this._changeAddrs.filter(o => o.address.indexOf(v) !== -1)
    this.unspentAddrs = this._unspentAddrs.filter(o => o.address.indexOf(v) !== -1)
  }

  pushAddressPage(addr: any) {
    this.navCtrl.push('AddressPage', {
      address: addr.address,
      path: addr.path
    })
  }

}
